// Ambiente descartável para os testes que precisam do servidor de verdade:
// - um BANCO NOVO (crm_teste_...), criado do zero com as migrações e apagado no fim. A
//   Brigada e qualquer outra empresa do banco normal não são tocadas;
// - o CRM compilado (`next start`) em outra porta, ligado a esse banco;
// - um servidor de e-mail e uma Evolution API de mentira, só neste computador;
// - chamadas às Server Actions reais, como o navegador faz.
//
// Só funciona com o banco local (localhost). Precisa do build atual: npm run build.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer as criarHttp, type IncomingMessage } from "node:http";
import { createServer as criarTcp, type AddressInfo, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";

// O terminal do teste mostra só o resultado: sem os e-mails e envios simulados.
const mostrar = console.log;
console.log = (...a: unknown[]) => {
  if (typeof a[0] === "string" && /^\s*\[(e-mail|whatsapp|campanhas|automação|contas|relógio)/.test(a[0])) return;
  mostrar(...a);
};

export const RAIZ = resolve(import.meta.dirname, "..", "..");
const enderecoPadrao = process.env.DATABASE_URL ?? "";

// ---------------------------------------------------------------- contagem ---

let passou = 0;
export function ok(nome: string, condicao: unknown) {
  if (!condicao) throw new Error(`FALHOU: ${nome}`);
  passou++;
  console.log(`  ✔ ${nome}`);
}
export const totalPassou = () => passou;
export const titulo = (t: string) => console.log(`\n${t}`);
export const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Repete até dar certo (para o que acontece depois da resposta). */
export async function ate<T>(fn: () => Promise<T> | T, msg: string, tempoMs = 8_000): Promise<NonNullable<T>> {
  const fim = Date.now() + tempoMs;
  for (;;) {
    const r = await fn();
    if (r) return r;
    if (Date.now() > fim) throw new Error(`Tempo esgotado: ${msg}`);
    await esperar(60);
  }
}

// ------------------------------------------------------------------- banco ---

/** Cria um banco vazio, aplica as migrações e aponta o processo para ele. */
export async function prepararBanco() {
  const url = new URL(enderecoPadrao);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Os testes só rodam no banco local (DATABASE_URL em localhost).");
  const nome = `crm_teste_${randomBytes(4).toString("hex")}`;
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const cliente = new pg.Client(admin.toString());
  await cliente.connect();
  await cliente.query(`CREATE DATABASE "${nome}" ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
  url.pathname = `/${nome}`;
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_POOL_MAX = "10";
  const r = spawnSync(process.execPath, [join(RAIZ, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: RAIZ,
    env: { ...process.env, DATABASE_URL: url.toString() },
    encoding: "utf8",
  });
  const apagar = async () => {
    await cliente.query(`DROP DATABASE IF EXISTS "${nome}" WITH (FORCE)`);
    await cliente.end();
  };
  if (r.status !== 0) {
    await apagar();
    throw new Error(`As migrações falharam:\n${r.stdout}\n${r.stderr}`);
  }
  return { nome, url: url.toString(), apagar };
}

// ---------------------------------------------------------------- servidor ---

function maisNovo(pasta: string): number {
  let t = 0;
  for (const i of readdirSync(pasta, { withFileTypes: true })) {
    const c = join(pasta, i.name);
    if (i.isDirectory()) t = Math.max(t, i.name === "generated" ? 0 : maisNovo(c));
    else t = Math.max(t, statSync(c).mtimeMs);
  }
  return t;
}

export function conferirBuild() {
  const id = join(RAIZ, ".next", "BUILD_ID");
  if (!existsSync(id)) throw new Error("Falta o build: rode npm run build antes.");
  if (statSync(id).mtimeMs < Math.max(maisNovo(join(RAIZ, "src")), statSync(join(RAIZ, "next.config.ts")).mtimeMs)) {
    throw new Error("O build está mais velho que o código: rode npm run build de novo.");
  }
}

async function portaLivre() {
  const s = criarTcp();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const { port } = s.address() as AddressInfo;
  await new Promise((r) => s.close(r));
  return port;
}

export type Servidor = { base: string; pasta: string; saida: () => string; desligar: () => Promise<void> };

/** Liga o CRM compilado (produção de verdade) numa porta livre. */
export async function ligarServidor(extra: Record<string, string | undefined> = {}): Promise<Servidor> {
  conferirBuild();
  const porta = await portaLivre();
  const pasta = mkdtempSync(join(tmpdir(), "crm-teste-arquivos-"));
  const env: Record<string, string | undefined> = {
    ...process.env,
    NODE_ENV: "production",
    NODE_OPTIONS: undefined,
    APP_URL: "https://crm.exemplo.test",
    ARQUIVOS_DIR: pasta,
    AUTOMACAO_DESLIGADA: "1", // o relógio nunca roda sozinho nos testes
    WHATSAPP_SIMULAR_ENVIO: "1", // nada sai para o WhatsApp
    WHATSAPP_WEBHOOK_SEGREDO: "segredo-de-teste-do-webhook",
    EVOLUTION_API_URL: "http://127.0.0.1:1",
    SMTP_HOST: undefined,
    SETUP_TOKEN: undefined,
    PROXY_IP_HEADER: undefined,
    DONO_EMAIL: undefined,
    CADASTRO_DESLIGADO: undefined,
    ...extra,
  };
  let texto = "";
  const processo: ChildProcess = spawn(process.execPath, [join(RAIZ, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(porta), "-H", "127.0.0.1"], {
    cwd: RAIZ,
    env: env as NodeJS.ProcessEnv,
  });
  processo.stdout?.on("data", (d) => (texto += d));
  processo.stderr?.on("data", (d) => (texto += d));
  const base = `http://127.0.0.1:${porta}`;
  const desligar = async () => {
    if (processo.exitCode === null) {
      const saiu = new Promise((r) => processo.once("exit", r));
      processo.kill();
      await Promise.race([saiu, esperar(5_000)]);
    }
    rmSync(pasta, { recursive: true, force: true });
  };
  try {
    await ate(
      async () => {
        if (processo.exitCode !== null) throw new Error(`O servidor parou:\n${texto}`);
        return (await fetch(`${base}/login`).catch(() => null))?.ok;
      },
      "o servidor não respondeu",
      60_000,
    );
  } catch (e) {
    await desligar();
    throw e;
  }
  return { base, pasta, saida: () => texto, desligar };
}

// --------------------------------------------------------- e-mail de mentira ---

export type EmailRecebido = { para: string[]; assunto: string; texto: string };

function decodificarParte(corpo: string, cabecalho: string) {
  if (/content-transfer-encoding:\s*base64/i.test(cabecalho)) return Buffer.from(corpo, "base64").toString("utf8");
  if (/content-transfer-encoding:\s*quoted-printable/i.test(cabecalho)) {
    const bytes = corpo.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return Buffer.from(bytes, "latin1").toString("utf8");
  }
  return corpo;
}

const decodificarAssunto = (t: string) =>
  t.replace(/\?=\s+=\?/g, "?==?").replace(/=\?utf-8\?(q|b)\?([^?]*)\?=/gi, (_, tipo, v) =>
    tipo.toLowerCase() === "b" ? Buffer.from(v, "base64").toString("utf8") : decodificarParte(v.replace(/_/g, " "), "content-transfer-encoding: quoted-printable"),
  );

function lerMensagem(bruto: string): Omit<EmailRecebido, "para"> {
  const [cabecalho, ...resto] = bruto.split("\r\n\r\n");
  const desdobrado = cabecalho.replace(/\r\n[ \t]+/g, " ");
  const assunto = decodificarAssunto(desdobrado.match(/^subject: (.*)$/im)?.[1] ?? "");
  const limite = desdobrado.match(/boundary="([^"]+)"/i)?.[1];
  let texto = decodificarParte(resto.join("\r\n\r\n"), desdobrado);
  if (limite) {
    const parte = bruto.split(`--${limite}`).find((p) => /content-type:\s*text\/plain/i.test(p)) ?? "";
    const [c, ...r] = parte.replace(/^\r\n/, "").split("\r\n\r\n");
    texto = decodificarParte(r.join("\r\n\r\n"), c);
  }
  return { assunto, texto };
}

/** Servidor SMTP mínimo, só neste computador. Guarda o que recebe. */
export async function ligarEmail() {
  const recebidos: EmailRecebido[] = [];
  const servidor = criarTcp((s) => {
    let dados = false;
    let acumulado = "";
    let mensagem = "";
    let para: string[] = [];
    s.write("220 teste ESMTP\r\n");
    s.on("error", () => {});
    s.on("data", (d) => {
      acumulado += d.toString("latin1");
      let i: number;
      while ((i = acumulado.indexOf("\r\n")) >= 0) {
        const linha = acumulado.slice(0, i);
        acumulado = acumulado.slice(i + 2);
        if (dados) {
          if (linha === ".") {
            dados = false;
            recebidos.push({ para, ...lerMensagem(Buffer.from(mensagem, "latin1").toString("utf8")) });
            mensagem = "";
            para = [];
            s.write("250 ok\r\n");
          } else mensagem += `${linha.startsWith("..") ? linha.slice(1) : linha}\r\n`;
          continue;
        }
        const comando = linha.slice(0, 4).toUpperCase();
        if (comando === "EHLO" || comando === "HELO") s.write("250 teste\r\n");
        else if (comando === "RCPT") {
          para.push(linha.match(/<([^>]*)>/)?.[1] ?? "");
          s.write("250 ok\r\n");
        } else if (comando === "DATA") {
          dados = true;
          s.write("354 pode mandar\r\n");
        } else if (comando === "QUIT") s.end("221 tchau\r\n");
        else s.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const porta = String((servidor.address() as AddressInfo).port);
  return {
    recebidos,
    env: { SMTP_HOST: "127.0.0.1", SMTP_PORTA: porta, EMAIL_REMETENTE: "CRM <nao-responda@exemplo.test>" },
    para: (email: string) => recebidos.filter((m) => m.para.includes(email)),
    fechar: () => fecharServidor(servidor),
  };
}

const fecharServidor = (s: Server) => new Promise<void>((r) => s.close(() => r()));

// -------------------------------------------------- Evolution API de mentira ---

export async function ligarEvolution() {
  const instancias = new Map<string, { estado: string }>();
  const pedidos: { metodo: string; caminho: string }[] = [];
  const modo = { falharEnvio: null as null | { status: number; corpo: unknown }, travarEstado: new Set<string>() };
  const corpoDe = async (req: IncomingMessage) => {
    let t = "";
    for await (const p of req) t += p;
    return t ? JSON.parse(t) : {};
  };
  const servidor = criarHttp(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const corpo = await corpoDe(req);
    pedidos.push({ metodo: req.method ?? "", caminho: url.pathname });
    const responder = (status: number, dados: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(dados));
    const ultima = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
    if (url.pathname === "/instance/fetchInstances") {
      const nome = url.searchParams.get("instanceName");
      if (nome && modo.travarEstado.has(nome)) return; // nunca responde
      const lista = [...instancias].filter(([n]) => !nome || n === nome).map(([name, i]) => ({ name, connectionStatus: i.estado }));
      return nome && lista.length === 0 ? responder(404, { message: "não existe" }) : responder(200, lista);
    }
    if (url.pathname === "/instance/create") {
      await esperar(50); // dá tempo de outra criação disputar
      instancias.set(corpo.instanceName, { estado: "connecting" });
      return responder(201, {});
    }
    if (url.pathname.startsWith("/instance/connectionState/")) return responder(200, { instance: { state: instancias.get(ultima)?.estado ?? "close" } });
    if (url.pathname.startsWith("/instance/connect/")) return responder(200, { base64: "data:image/png;base64,QR" });
    if (url.pathname.startsWith("/message/")) {
      if (modo.falharEnvio) return responder(modo.falharEnvio.status, modo.falharEnvio.corpo);
      return responder(201, { key: { id: `falso-${randomBytes(6).toString("hex")}` } });
    }
    return responder(200, {});
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  return {
    url,
    instancias,
    pedidos,
    modo,
    fechar: () => {
      servidor.closeAllConnections();
      return fecharServidor(servidor);
    },
  };
}

// ---------------------------------------------------------------- sessões ---

type BancoDeSessoes = { sessao: { create: (a: { data: { usuarioId: string; tokenHash: string; expiraEm: Date; navegador: string } }) => Promise<unknown> } };

/** Cria uma sessão direto no banco e devolve o cookie (como o login faria). */
export async function cookieDe(db: BancoDeSessoes, usuarioId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.sessao.create({
    data: { usuarioId, tokenHash: createHash("sha256").update(token).digest("hex"), expiraEm: new Date(Date.now() + 3600_000), navegador: "teste" },
  });
  return `crm_sessao=${token}`;
}

export async function pagina(base: string, caminho: string, cookie?: string, cabecalhos: Record<string, string> = {}) {
  const r = await fetch(`${base}${caminho}`, { headers: { ...(cookie ? { cookie } : {}), ...cabecalhos }, redirect: "manual", signal: AbortSignal.timeout(60_000) });
  return { status: r.status, html: await r.text(), cabecalhos: r.headers };
}

// ----------------------------------------------------------- Server Actions ---

export type RespostaAction = {
  status: number;
  /** Para onde a action mandou (redirect), sem o modo. */
  redirecionou: string | null;
  /** O valor devolvido pela action (o estado do formulário). */
  valor: unknown;
  /** A action lançou erro. */
  falhou: boolean;
  cookies: string[];
  texto: string;
  ms: number;
};

type Opcoes = { cookie?: string; caminho?: string; cabecalhos?: Record<string, string> };

/**
 * Chama as Server Actions do servidor compilado, do mesmo jeito que o navegador:
 * POST na página com o cabeçalho Next-Action e os argumentos no formato do React. O id
 * de cada função vem do manifesto do build, então é a função verdadeira que roda, com
 * sessão, papel e tudo. Serve para chamar com ids de OUTRA empresa, o que a tela não faria.
 */
export function criarChamador(base: string) {
  const manifesto = JSON.parse(readFileSync(join(RAIZ, ".next", "server", "server-reference-manifest.json"), "utf8")) as {
    node: Record<string, { filename: string; exportedName: string; workers: Record<string, unknown> }>;
  };
  const acoes = new Map<string, { id: string; paginas: string[] }>();
  for (const [id, a] of Object.entries(manifesto.node)) {
    acoes.set(`${a.filename.replace(/^src\/app\/(\([a-z]+\)\/)?/, "").replace(/\/actions\.ts$/, "")}.${a.exportedName}`, { id, paginas: Object.keys(a.workers) });
  }

  /** Argumentos no formato do React (encodeReply): JSON, com os FormData em campos à parte. */
  function codificar(args: unknown[]) {
    const form = new FormData();
    let proximo = 1;
    let temForm = false;
    const valor = (v: unknown): unknown => {
      if (v instanceof FormData) {
        temForm = true;
        const n = (proximo++).toString(16);
        for (const [c, x] of v) form.append(`_${n}_${c}`, x);
        return `$K${n}`;
      }
      if (v === undefined) return "$undefined";
      if (typeof v === "string") return v.startsWith("$") ? `$${v}` : v;
      return v;
    };
    const json = JSON.stringify(args.map(valor));
    if (!temForm) return json;
    form.append("0", json);
    return form;
  }

  /** Lê o valor devolvido na resposta (formato Flight): linha 0 aponta para a linha do resultado. */
  function lerResultado(texto: string) {
    const linhas = new Map<string, string>();
    for (const l of texto.split("\n")) {
      const i = l.indexOf(":");
      if (i > 0 && /^[0-9a-f]+$/.test(l.slice(0, i))) linhas.set(l.slice(0, i), l.slice(i + 1));
    }
    const ref = linhas.get("0")?.match(/"a":"\$@([0-9a-f]+)"/)?.[1];
    const bruto = ref ? linhas.get(ref) : undefined;
    if (bruto === undefined) return { valor: undefined, falhou: false };
    if (bruto.startsWith("E")) return { valor: undefined, falhou: true };
    try {
      return { valor: JSON.parse(bruto), falhou: false };
    } catch {
      return { valor: bruto, falhou: false };
    }
  }

  async function chamar(nome: string, args: unknown[], { cookie, caminho, cabecalhos = {} }: Opcoes = {}): Promise<RespostaAction> {
    const acao = acoes.get(nome);
    if (!acao) throw new Error(`Server Action não encontrada no build: ${nome}. Há: ${[...acoes.keys()].join(", ")}`);
    const corpo = codificar(args);
    // A página em que o navegador estaria (só importa ser uma que conhece a action).
    const padrao = `/${(acao.paginas.find((p) => p.includes("(publico)/login")) ?? acao.paginas[0]).replace(/^app\//, "").replace(/\([a-z]+\)\//g, "").replace(/\/?page$/, "")}`;
    const t = performance.now();
    const r = await fetch(`${base}${caminho ?? padrao}`, {
      method: "POST",
      body: corpo,
      redirect: "manual",
      headers: {
        "next-action": acao.id,
        accept: "text/x-component",
        origin: base,
        ...(typeof corpo === "string" ? { "content-type": "text/plain;charset=UTF-8" } : {}),
        ...(cookie ? { cookie } : {}),
        ...cabecalhos,
      },
      signal: AbortSignal.timeout(60_000),
    });
    const texto = await r.text();
    return {
      status: r.status,
      redirecionou: r.headers.get("x-action-redirect")?.split(";")[0] ?? (r.status >= 300 && r.status < 400 ? r.headers.get("location") : null),
      ...lerResultado(texto),
      cookies: r.headers.getSetCookie(),
      texto,
      ms: performance.now() - t,
    };
  }

  return { chamar, nomes: [...acoes.keys()].sort(), idDe: (nome: string) => acoes.get(nome)!.id };
}

export function form(campos: Record<string, string | string[] | File>) {
  const f = new FormData();
  for (const [c, v] of Object.entries(campos)) for (const x of Array.isArray(v) ? v : [v]) f.append(c, x);
  return f;
}

/** O cookie que a resposta gravou (ex.: "crm_sessao"), pronto para mandar de volta. */
export function cookieGravado(r: RespostaAction, nome: string) {
  const c = r.cookies.map((x) => x.split(";")[0]).find((x) => x.startsWith(`${nome}=`) && x.length > nome.length + 1);
  return c ?? null;
}

export const codigoDoLink = (texto: string) => texto.match(/[?&]codigo=([\w-]+)/)?.[1] ?? null;
