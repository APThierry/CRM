// Teste de segurança: webhooks (SSRF), login, primeiro acesso, links e convites, teto de
// envios, justiça do relógio, certificados, limites de tamanho e espaço.
//
// Usa um banco descartável (criado e apagado aqui; não toca no banco do CRM) e o CRM
// compilado em modo de produção, numa porta livre. O e-mail e a Evolution API são de
// mentira, neste computador. Nada sai para a internet.
//
// Uso (com o banco local ligado e o build atual):
//   npm run build
//   npx tsx --conditions=react-server scripts/testar-seguranca.mts
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import { createServer as criarTcp, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ate, codigoDoLink, conferirBuild, cookieDe, cookieGravado, criarChamador, esperar, form, ligarEmail, ligarEvolution, ligarServidor, ok, pagina, prepararBanco, RAIZ, titulo, totalPassou,
  type RespostaAction, type Servidor,
} from "./apoio/ambiente-teste.mjs";

conferirBuild();
const pastaArquivos = mkdtempSync(join(tmpdir(), "crm-teste-cota-"));
const evolution = await ligarEvolution();
const email = await ligarEmail();
Object.assign(process.env, {
  APP_URL: "https://crm.exemplo.test",
  WHATSAPP_SIMULAR_ENVIO: "1",
  AUTOMACAO_DESLIGADA: "1",
  EVOLUTION_API_URL: evolution.url,
  EVOLUTION_API_KEY: "chave-de-teste",
  ARQUIVOS_DIR: pastaArquivos,
});
delete process.env.SMTP_HOST;
delete process.env.WEBHOOKS_PERMITIR_LOCAL;

const banco = await prepararBanco();
const { conversa, dadosCompletos, db, empresa, numeroNovo, SENHA_TESTE, sufixo, usuario, usuarioAtual } = await import("./apoio/dados.mjs");
const { ipPublico, validarUrl } = await import("../src/lib/webhooks/destino");
const { conferirDestino, postar } = await import("../src/lib/webhooks/requisicao");
const wh = await import("../src/lib/webhooks/disparar");
const limite = await import("../src/lib/limite");
const { REGRAS_LOGIN, reservarLogin } = await import("../src/lib/login-protecao");
const senhas = await import("../src/lib/senha");
const { primeiroAcesso } = await import("../src/lib/primeiro-acesso");
const { setupToken } = await import("../src/lib/ambiente");
const conta = await import("../src/lib/conta");
const { criarEmpresa } = await import("../src/lib/empresas/criar");
const cota = await import("../src/lib/whatsapp/cota");
const { enviarAutomatico, enviarNaConversa } = await import("../src/lib/whatsapp/enviar");
const evo = await import("../src/lib/whatsapp/evolution");
const { agendarMensagem } = await import("../src/lib/automacao/agendar");
const { atualizarWebhooksWhatsapp, POR_RODADA: AGENDADAS_POR_RODADA, processarAgendadas } = await import("../src/lib/automacao/relogio");
const { escolherEmpresas } = await import("../src/lib/automacao/rodizio");
const { processarCampanhas } = await import("../src/lib/campanhas/motor");
const { emitirCertificado } = await import("../src/lib/certificados");
const arquivos = await import("../src/lib/arquivos");

const servidores: Servidor[] = [];
const ligar = async (extra: Record<string, string | undefined> = {}) => {
  const s = await ligarServidor({ EVOLUTION_API_URL: evolution.url, EVOLUTION_API_KEY: "chave-de-teste", PROXY_IP_HEADER: "x-real-ip", ...email.env, ...extra });
  servidores.push(s);
  return s;
};
const desligar = async (s: Servidor) => {
  servidores.splice(servidores.indexOf(s), 1);
  await s.desligar();
};

const ambiente = process.env as Record<string, string | undefined>;
async function comEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> {
  const antes = Object.fromEntries(Object.keys(env).map((k) => [k, ambiente[k]]));
  const por = (valores: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(valores)) if (v === undefined) delete ambiente[k];
      else ambiente[k] = v;
  };
  por(env);
  try {
    return await fn();
  } finally {
    por(antes);
  }
}
const erroDe = (r: RespostaAction) => (r.valor as { erro?: string } | null)?.erro ?? "";
const okDe = (r: RespostaAction) => (r.valor as { ok?: string } | null)?.ok ?? "";
const mediana = (l: number[]) => [...l].sort((a, b) => a - b)[Math.floor(l.length / 2)];
let ip4 = 0;
const ipNovo = () => `198.51.${Math.floor(++ip4 / 250)}.${(ip4 % 250) + 1}`;
const deIp = (ip = ipNovo()) => ({ "x-real-ip": ip });
const ouvir = async (s: Server | ReturnType<typeof criarTcp>) => {
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return (s.address() as AddressInfo).port;
};
const esperarTudo = async <T,>(ps: Promise<T>[]) => {
  const rs = await Promise.allSettled(ps);
  return { certos: rs.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])), erros: rs.flatMap((r) => (r.status === "rejected" ? [r.reason] : [])) };
};

try {
  // =====================================================================================
  titulo("1. Webhooks: para onde o servidor pode conectar (SSRF)");
  const proibidos = [
    "0.0.0.0", "10.0.0.1", "10.255.255.255", "100.64.0.1", "100.127.255.255", "127.0.0.1", "127.255.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.0.0.1", "192.0.2.1", "192.88.99.1",
    "192.168.1.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "239.1.1.1", "240.0.0.1", "255.255.255.255",
    "::", "::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:8.8.8.8", "::127.0.0.1", "::ffff:0:127.0.0.1", "64:ff9b::7f00:1", "64:ff9b::8.8.8.8", "64:ff9b:1::1", "100::1", "2001::1", "2001:db8::1", "2002:7f00:1::",
    "2002:808:808::1", "3fff::1", "5f00::1", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "fec0::1", "ff02::1", "2600:1f00::5efe:7f00:1", "2600:1f00::200:5efe:a00:1", "abc", "", "1.2.3", "8.8.8.8:80",
  ];
  ok(`${proibidos.length} endereços internos, reservados ou embutidos são recusados`, proibidos.filter(ipPublico).join() === "");
  ok("endereços públicos são aceitos", ["8.8.8.8", "93.184.216.34", "100.63.255.255", "100.128.0.1", "172.15.0.1", "172.32.0.1", "192.167.1.1", "223.255.255.255", "2606:4700:4700::1111", "2a00:1450:4001::200e"].every(ipPublico));
  const urlsRuins = [
    "http://127.0.0.1/", "http://localhost:3000/", "http://LOCALHOST./", "http://a.localhost/", "http://2130706433/", "http://0x7f.1/", "http://0177.0.0.1/", "http://127.1/", "http://[::1]/", "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/", "http://[fd00::1]/", "http://169.254.169.254/latest/meta-data", "http://evolution-api:8080/", "http://postgres/", "http://painel.local/", "http://x.internal/", "http://metadata.google.internal/",
    "http://host.docker.internal/", "http://roteador.lan/", "http://1.0.0.127.in-addr.arpa/", "http://①②⑦.⓪.⓪.①/", "ftp://exemplo.com/", "file:///etc/passwd", "gopher://exemplo.com/", "javascript:alert(1)", "//exemplo.com", "exemplo.com",
    "https://user:senha@exemplo.com/", `https://exemplo.com/${"a".repeat(600)}`,
  ];
  ok(`${urlsRuins.length} formas de apontar para dentro (ou inválidas) são recusadas`, urlsRuins.filter((u) => !validarUrl(u).erro).join() === "");
  ok("site público é aceito", ["https://exemplo.com/gancho?x=1", "https://hooks.zapier.com/hooks/1", "https://93.184.216.34/x"].every((u) => validarUrl(u).url));
  await comEnv({ NODE_ENV: "production", WEBHOOKS_PERMITIR_LOCAL: "1" }, () => {
    ok("em produção: só https, portas 443 e 8443", ["https://exemplo.com/", "https://exemplo.com:443/", "https://exemplo.com:8443/"].every((u) => validarUrl(u).url) && ["http://exemplo.com/", "https://exemplo.com:22/", "https://exemplo.com:8080/", "https://exemplo.com:80/"].every((u) => validarUrl(u).erro));
    ok("em produção a variável de destino local é ignorada", ["https://127.0.0.1/", "https://localhost/", "https://10.0.0.1/"].every((u) => validarUrl(u).erro));
  });

  let acessos = 0;
  const interno = createServer((_req, res) => {
    acessos++;
    res.end("SEGREDO INTERNO");
  });
  const portaInterna = await ouvir(interno);
  const enviar = (url: string, consulta?: (n: string) => Promise<string[]>, tempoMs = 2_000) => postar(url, { corpo: "{}", cabecalhos: { "Content-Type": "application/json" }, consulta, tempoMs });
  const sempre = (...ips: string[]) => async () => ips;
  ok("nome público que aponta para dentro é recusado, sem conectar", (await enviar(`http://gancho.exemplo.com:${portaInterna}/`, sempre("127.0.0.1"))).erro === "endereço não permitido" && acessos === 0);
  ok("um IP interno no meio de IPs públicos recusa todos", (await enviar(`http://gancho.exemplo.com:${portaInterna}/`, sempre("93.184.216.34", "127.0.0.1"))).erro === "endereço não permitido" && acessos === 0);
  ok("IPv6 com IPv4 embutido é recusado", (await enviar(`http://gancho.exemplo.com:${portaInterna}/`, sempre("::ffff:127.0.0.1"))).erro === "endereço não permitido" && acessos === 0);
  let consultas = 0;
  const contar = async () => {
    consultas++;
    return ["93.184.216.34"];
  };
  ok("IP literal interno é recusado sem consultar DNS", (await enviar(`http://127.0.0.1:${portaInterna}/`, contar)).erro === "endereço não permitido" && consultas === 0 && acessos === 0);
  // Rebinding: na conferência do cadastro o nome é público; na entrega passou a apontar para dentro.
  consultas = 0;
  const trocaDns = async () => (consultas++ === 0 ? ["93.184.216.34"] : ["127.0.0.1"]);
  const cadastro = await conferirDestino(`http://rebind.exemplo.com:${portaInterna}/`, trocaDns);
  const entregaRebind = await enviar(cadastro.url!, trocaDns);
  ok("DNS que muda depois do cadastro (rebinding): passa no cadastro e é recusado na conexão", cadastro.url && entregaRebind.erro === "endereço não permitido" && acessos === 0 && consultas === 2);
  consultas = 0;
  await enviar("http://gancho.exemplo.com:9/", async () => (consultas++, ["203.0.113.9"]));
  ok("cada entrega consulta o nome uma vez só (conecta no IP que conferiu)", consultas === 1);
  ok("ao cadastrar, nome que aponta para dentro e nome que não existe têm a mesma mensagem", (await conferirDestino("https://a.exemplo.com/", sempre("10.0.0.5"))).erro === (await conferirDestino("https://b.exemplo.com/", sempre())).erro);

  await comEnv({ WEBHOOKS_PERMITIR_LOCAL: "1" }, async () => {
    ok("controle: com a variável de teste, entrega no servidor local pelo IP consultado", (await enviar(`http://gancho.exemplo.com:${portaInterna}/`, sempre("127.0.0.1"))).codigo === 200 && acessos === 1);
    acessos = 0;
    const desvia = createServer((_req, res) => res.writeHead(302, { location: `http://127.0.0.1:${portaInterna}/` }).end());
    const pDesvia = await ouvir(desvia);
    ok("redirecionamento não é seguido", (await enviar(`http://127.0.0.1:${pDesvia}/`)).codigo === 302 && acessos === 0);
    desvia.close();

    let mandados = 0;
    const infinito = createServer((_req, res) => {
      res.writeHead(500);
      const t = setInterval(() => {
        mandados += 64 * 1024;
        res.write(Buffer.alloc(64 * 1024, "x"));
      }, 1);
      res.on("close", () => clearInterval(t));
    });
    const pInfinito = await ouvir(infinito);
    const t0 = Date.now();
    const doInfinito = await enviar(`http://127.0.0.1:${pInfinito}/`);
    await esperar(100);
    const depois = mandados;
    await esperar(200);
    ok("corpo sem fim não é lido: responde pelo código e fecha a conexão", doInfinito.codigo === 500 && Date.now() - t0 < 1_500 && mandados === depois);
    infinito.closeAllConnections();
    infinito.close();

    const mudo = criarTcp(() => {});
    const pMudo = await ouvir(mudo);
    const t1 = Date.now();
    const doMudo = await enviar(`http://127.0.0.1:${pMudo}/`, undefined, 600);
    ok("servidor que nunca responde: desiste no tempo total", /não respondeu/.test(doMudo.erro ?? "") && Date.now() - t1 < 1_200);
    const gota = criarTcp((s) => {
      s.on("error", () => {});
      s.write("HTTP/1.1 200 OK\r\n");
      const t = setInterval(() => s.write("X-A: 1\r\n"), 50);
      s.on("close", () => clearInterval(t));
    });
    const pGota = await ouvir(gota);
    const t2 = Date.now();
    ok("cabeçalhos a conta-gotas não estendem o tempo", /não respondeu/.test((await enviar(`http://127.0.0.1:${pGota}/`, undefined, 600)).erro ?? "") && Date.now() - t2 < 1_200);
    ok("DNS que nunca responde também não", /não respondeu/.test((await comEnv({ WEBHOOKS_PERMITIR_LOCAL: undefined }, () => enviar("http://x.exemplo.com/", () => new Promise(() => {}), 500))).erro ?? ""));
    const fechado = await enviar("http://127.0.0.1:1/");
    ok("erro de conexão vira uma frase fixa, sem IP, porta ou código", fechado.erro === "não consegui conectar");
    mudo.close();
    gota.close();
  });

  // =====================================================================================
  titulo("2. Primeiro acesso em produção");
  const seed = await criarEmpresa({ nome: "Empresa do Seed", admin: { nome: "Seed", email: "admin@seed.test" } });
  ok("no desenvolvimento continua igual (uma empresa, ninguém com senha, sem código)", (await primeiroAcesso())?.exigeCodigo === false);
  // Alguém se cadastra ANTES do dono fazer o primeiro acesso.
  await conta.processarPedidoDeCadastro({ empresa: "Apressada", ramo: "Outro", nome: "Z", email: "apressada@x.test", telefone: null });
  const { caixaDeSaida } = await import("../src/lib/email");
  await conta.concluirCadastro(codigoDoLink(caixaDeSaida.at(-1)!.texto)!, "senha-da-apressada");
  ok("código curto não vale como SETUP_TOKEN", await comEnv({ SETUP_TOKEN: "curto" }, () => setupToken() === null));

  const token = `token-de-instalacao-${sufixo()}${sufixo()}`;
  const acessoInicial = (senha = "senha-do-dono-1") => form({ codigo: token, nome: "Dono", email: "dono@seed.test", senha, confirmacao: senha });
  let s = await ligar({ SETUP_TOKEN: undefined });
  let c = criarChamador(s.base);
  ok("sem SETUP_TOKEN: a tela não oferece", !(await pagina(s.base, "/login")).html.includes("Primeiro acesso"));
  ok("sem SETUP_TOKEN: a action recusa", /fechado/.test(erroDe(await c.chamar("login.configurarPrimeiroAcesso", [null, acessoInicial()]))) && (await db.usuario.count({ where: { email: "dono@seed.test" } })) === 0);
  await desligar(s);

  s = await ligar({ SETUP_TOKEN: token });
  c = criarChamador(s.base);
  const telaLogin = (await pagina(s.base, "/login")).html;
  ok("com SETUP_TOKEN: oferece junto do login (outras empresas continuam entrando)", telaLogin.includes("Primeiro acesso") && telaLogin.includes("current-password"));
  const atacante = ipNovo();
  const errados = await Promise.all(Array.from({ length: 12 }, (_, i) => c.chamar("login.configurarPrimeiroAcesso", [null, form({ codigo: `chute-${i}-aaaaaaaaaaaaaa`, nome: "X", email: "x@x.test", senha: "12345678", confirmacao: "12345678" })], { cabecalhos: deIp(atacante) })));
  ok("12 chutes ao mesmo tempo: 5 conferidos, 7 barrados", errados.filter((r) => /incorreto/.test(erroDe(r))).length === 5 && errados.filter((r) => /Muitas tentativas/.test(erroDe(r))).length === 7);
  ok("depois disso, nem o código certo passa daquele IP", /Muitas tentativas/.test(erroDe(await c.chamar("login.configurarPrimeiroAcesso", [null, acessoInicial()], { cabecalhos: deIp(atacante) }))));
  const certos = await Promise.all(Array.from({ length: 4 }, () => c.chamar("login.configurarPrimeiroAcesso", [null, acessoInicial()], { cabecalhos: deIp() })));
  const donos = await db.usuario.findMany({ where: { email: "dono@seed.test" } });
  ok("código certo, quatro vezes juntas, de outro IP: um administrador só, na empresa do seed", certos.filter((r) => r.redirecionou === "/").length === 1 && donos.length === 1 && donos[0].organizacaoId === seed.org.id && donos[0].papel === "ADMIN");
  ok("depois do primeiro acesso, fecha", /fechado/.test(erroDe(await c.chamar("login.configurarPrimeiroAcesso", [null, acessoInicial()], { cabecalhos: deIp() }))) && !(await pagina(s.base, "/login")).html.includes("Primeiro acesso"));
  await desligar(s);

  // =====================================================================================
  s = await ligar({ ENVIOS_DIA_NAO_APROVADA: "6", USUARIOS_POR_EMPRESA: "6", MIDIA_RECEBIDA_MB: "1", WEBHOOKS_PERMITIR_LOCAL: "1" });
  c = criarChamador(s.base);
  const { chamar } = c;
  const { base } = s;
  const A = await empresa("Empresa A");
  const B = await empresa("Empresa B");
  const cookieA = await cookieDe(db, A.admin.id);
  const cookieB = await cookieDe(db, B.admin.id);
  const entrar = (mail: string, senha: string, ip?: string, cookie?: string) => chamar("login.entrar", [null, form({ email: mail, senha })], { cabecalhos: deIp(ip), cookie });

  titulo("2b. Script definir-acesso (quem tem o terminal do servidor)");
  const rodarScript = (arquivo: string, args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [join(RAIZ, "node_modules", "tsx", "dist", "cli.mjs"), "--conditions=react-server", join(RAIZ, arquivo), ...args], { cwd: RAIZ, encoding: "utf8", env: { ...process.env, ...env } });
  const doSeed = rodarScript("scripts/definir-acesso.mts", ["admin@seed.test"], { APP_URL: "https://crm.exemplo.test" });
  const linkScript = codigoDoLink(doSeed.stdout)!;
  ok("mostra o link para o administrador do seed definir a própria senha", doSeed.status === 0 && doSeed.stdout.includes("https://crm.exemplo.test/senha/nova?codigo="));
  const peloScript = await chamar("senha.definirNovaSenha", [linkScript, null, form({ senha: "senha-do-seed-1", confirmacao: "senha-do-seed-1" })], { caminho: "/senha/nova", cabecalhos: deIp() });
  ok("o link funciona e já entra", peloScript.redirecionou === "/" && cookieGravado(peloScript, "crm_sessao") && (await entrar("admin@seed.test", "senha-do-seed-1")).redirecionou === "/");
  ok("e-mail sem conta, sem --empresa: recusa", rodarScript("scripts/definir-acesso.mts", ["ninguem@x.test"]).status === 1);
  const novoAdmin = rodarScript("scripts/definir-acesso.mts", ["outro@seed.test", "--empresa", seed.org.slug, "--nome", "Outro"]);
  ok("com --empresa cria um administrador sem senha nessa empresa", novoAdmin.status === 0 && (await db.usuario.findUniqueOrThrow({ where: { email: "outro@seed.test" } })).emailConfirmadoEm === null);
  ok("o administrador não confirmado ainda não entra", /incorretos/.test(erroDe(await entrar("outro@seed.test", "qualquer-senha"))));
  const novaEmpresa = rodarScript("scripts/criar-empresa.mts", ["Pelo terminal", "Admin", "terminal@x.test"], { APP_URL: "https://crm.exemplo.test" });
  ok("criar-empresa mostra link, e nunca uma senha", novaEmpresa.status === 0 && codigoDoLink(novaEmpresa.stdout) && !/senha provisória/i.test(novaEmpresa.stdout) && (await db.usuario.findUniqueOrThrow({ where: { email: "terminal@x.test" } })).senhaHash === senhas.SEM_SENHA);
  const orgs = await db.organizacao.count();
  const semeou = rodarScript("prisma/seed.ts", [], { NODE_ENV: "production" });
  ok("seed recusa rodar em produção, sem mexer no banco", semeou.status === 1 && /não roda em produção/.test(semeou.stderr) && (await db.organizacao.count()) === orgs);
  ok("seed recusa um banco que não seja local", rodarScript("prisma/seed.ts", [], { DATABASE_URL: "postgresql://u:s@banco.exemplo.test/crm" }).status === 1);

  // =====================================================================================
  titulo("3. Login");
  const alvo = await usuario(A.org.id, "GESTOR");
  const ipCasa = ipNovo();
  const rajada = await Promise.all(Array.from({ length: 60 }, (_, i) => entrar(alvo.email, `errada-${i}`, ipCasa)));
  const conferidas = rajada.filter((r) => /incorretos/.test(erroDe(r))).length;
  ok(`rajada de 60 senhas ao mesmo tempo: ${REGRAS_LOGIN.porIpEmail} conferidas, o resto barrado`, conferidas === REGRAS_LOGIN.porIpEmail && rajada.filter((r) => /Muitas tentativas/.test(erroDe(r))).length === 60 - REGRAS_LOGIN.porIpEmail);
  const doOutroIp = await entrar(alvo.email, SENHA_TESTE);
  ok("o dono, de outro IP, entra normalmente", doOutroIp.redirecionou === "/" && cookieGravado(doOutroIp, "crm_sessao"));
  const aparelho = cookieGravado(doOutroIp, "crm_aparelho")!;
  ok("e ganha o cookie de aparelho (HttpOnly, só em /login, sem dar acesso)", aparelho && doOutroIp.cookies.some((x) => x.startsWith("crm_aparelho=") && /HttpOnly/i.test(x) && /Path=\/login/i.test(x)) && (await pagina(base, "/clientes", aparelho)).status === 307);
  // Ataque de muitos lugares contra a mesma conta.
  const distribuido = await Promise.all(Array.from({ length: 60 }, (_, i) => entrar(alvo.email, `dist-${i}`)));
  const passaram = distribuido.filter((r) => /incorretos/.test(erroDe(r))).length;
  ok(`ataque de 60 IPs: no máximo ${REGRAS_LOGIN.porEmail} senhas conferidas em 15 min, somando tudo`, conferidas + passaram === REGRAS_LOGIN.porEmail);
  ok("o dono, no aparelho em que já entrou, continua entrando", (await entrar(alvo.email, SENHA_TESTE, undefined, aparelho)).redirecionou === "/");
  ok("cookie de aparelho inventado (ou de outra conta) não passa", /Muitas tentativas/.test(erroDe(await entrar(alvo.email, SENHA_TESTE, undefined, "crm_aparelho=abc.def"))) && /Muitas tentativas/.test(erroDe(await entrar(alvo.email, SENHA_TESTE, undefined, cookieGravado(await entrar(B.admin.email, SENHA_TESTE), "crm_aparelho")!))));
  const noAparelho = await Promise.all(Array.from({ length: 20 }, (_, i) => entrar(alvo.email, `a-${i}`, undefined, aparelho)));
  ok(`mesmo com o cookie, só ${REGRAS_LOGIN.porAparelho} senhas erradas`, noAparelho.filter((r) => /incorretos/.test(erroDe(r))).length === REGRAS_LOGIN.porAparelho);
  const emNovo = await entrar(alvo.email, SENHA_TESTE);
  ok("num aparelho novo, durante o ataque, a tela indica o caminho", /Esqueci minha senha/.test(erroDe(emNovo)));
  await chamar("senha.pedirNovaSenha", [null, form({ email: alvo.email })], { cabecalhos: deIp() });
  const linkAlvo = codigoDoLink((await ate(() => email.para(alvo.email).at(-1), "e-mail de senha")).texto)!;
  const recuperou = await chamar("senha.definirNovaSenha", [linkAlvo, null, form({ senha: "senha-nova-do-alvo", confirmacao: "senha-nova-do-alvo" })], { cabecalhos: deIp() });
  ok("e \"Esqueci minha senha\" funciona e já entra (ninguém tranca a conta de outra pessoa)", recuperou.redirecionou === "/" && cookieGravado(recuperou, "crm_sessao"));
  ok("trocar a senha invalida o cookie de aparelho antigo", /Muitas tentativas/.test(erroDe(await entrar(alvo.email, "senha-nova-do-alvo", undefined, aparelho))));
  const vitima2 = await usuario(A.org.id, "VENDEDOR");
  const mesmoIp = ipNovo();
  const falsos = await Promise.all(Array.from({ length: 12 }, (_, i) => chamar("login.entrar", [null, form({ email: vitima2.email, senha: `x-${i}` })], { cabecalhos: { "x-real-ip": mesmoIp, "x-forwarded-for": `203.0.113.${i}` } })));
  ok("inventar X-Forwarded-For não muda o IP", falsos.filter((r) => /incorretos/.test(erroDe(r))).length === REGRAS_LOGIN.porIpEmail);
  const spray = await Promise.all(Array.from({ length: 45 }, (_, i) => entrar(`ninguem-${i}@x.test`, "x", mesmoIp)));
  ok(`um IP tentando vários e-mails para em ${REGRAS_LOGIN.porIp}`, spray.filter((r) => /incorretos/.test(erroDe(r))).length === REGRAS_LOGIN.porIp - REGRAS_LOGIN.porIpEmail);

  const inativo = await usuario(A.org.id, "VENDEDOR");
  await db.usuario.update({ where: { id: inativo.id }, data: { ativo: false } });
  const naoConfirmado = await usuario(A.org.id, "VENDEDOR");
  await db.usuario.update({ where: { id: naoConfirmado.id }, data: { emailConfirmadoEm: null } });
  const mesmas = await Promise.all([entrar("nao-existe@x.test", SENHA_TESTE), entrar(inativo.email, SENHA_TESTE), entrar(naoConfirmado.email, SENHA_TESTE), entrar(A.admin.email, "errada")]);
  ok("conta inexistente, desativada, não confirmada e senha errada: a mesma mensagem", new Set(mesmas.map(erroDe)).size === 1 && mesmas.every((r) => !r.cookies.length));
  ok("sessão de usuário não confirmado não vale", (await pagina(base, "/api/exportar/clientes.csv", await cookieDe(db, naoConfirmado.id))).status === 401);
  const enormes = [await entrar(`${"a".repeat(400)}@x.test`, "x"), await entrar(A.admin.email, "x".repeat(5000))];
  ok("e-mail ou senha enormes: mesma mensagem, sem fazer a conta", enormes.every((r) => /incorretos/.test(erroDe(r)) && r.ms < 60));
  const existentes = await Promise.all(Array.from({ length: 15 }, () => usuario(B.org.id, "VENDEDOR")));
  const [comConta, semConta]: [number[], number[]] = [[], []];
  for (const [i, u] of existentes.entries()) {
    comConta.push((await entrar(u.email, "errada-mesmo")).ms);
    semConta.push((await entrar(`fantasma-${i}@empresa.test`, "errada-mesmo")).ms);
  }
  const [mc, ms] = [mediana(comConta), mediana(semConta)];
  ok(`tempo de resposta não revela a conta (mediana ${mc.toFixed(0)} ms com conta, ${ms.toFixed(0)} ms sem)`, Math.abs(mc - ms) < Math.max(mc, ms) * 0.35);

  await Promise.allSettled(Array.from({ length: 30 }, () => senhas.conferirSenha("x", null)));
  ok("contas de senha ao mesmo tempo: no máximo 2", senhas.picoScrypt() === 2);
  const lotado = await esperarTudo(Array.from({ length: 80 }, () => senhas.conferirSenha("x", null)));
  ok("fila cheia recusa o excesso em vez de acumular", lotado.erros.length === 80 - 42 && lotado.erros.every((e) => e instanceof senhas.ErroOcupado));
  const agora = Date.now();
  for (let i = 0; i < limite.MAX_CHAVES; i++) reservarLogin(`ip-${i}`, `muitos-${i}@x.test`, agora); // nenhuma venceu: 3 chaves por tentativa
  const cheio = limite.totalDeChaves();
  reservarLogin("ip-novo", "novo@x.test", agora + 24 * 3600_000);
  for (let i = 0; i < limite.MAX_CHAVES / 2; i++) reservarLogin(`ip2-${i}`, `depois-${i}@x.test`, agora + 24 * 3600_000 + i * 60_000);
  ok("o mapa de tentativas tem teto e limpa o que venceu", cheio <= limite.MAX_CHAVES + 3 && cheio > limite.MAX_CHAVES / 2 && limite.totalDeChaves() <= limite.MAX_CHAVES + 3);
  ok("IPv6 conta pela rede /64, IPv4 embutido vira IPv4, lixo vira desconhecido", limite.normalizarIp("2001:db8:1:2:aaaa::1") === limite.normalizarIp("2001:db8:1:2:ffff:1:2:3") && limite.normalizarIp("::ffff:1.2.3.4") === "1.2.3.4" && limite.normalizarIp("<script>") === null);

  const cookieAlvo = await cookieDe(db, vitima2.id);
  const trocas = await Promise.all(Array.from({ length: 12 }, (_, i) => chamar("usuarios.trocarMinhaSenha", [null, form({ atual: `chute-${i}`, nova: "nova-senha-123", confirmacao: "nova-senha-123" })], { cookie: cookieAlvo })));
  ok("trocar a própria senha: 5 chutes da senha atual e bloqueia", trocas.filter((r) => /incorreta/.test(erroDe(r))).length === 5 && trocas.filter((r) => /Muitas/.test(erroDe(r))).length === 7);
  const u3 = await usuario(A.org.id, "VENDEDOR");
  const [c3, c3b] = [await cookieDe(db, u3.id), await cookieDe(db, u3.id)];
  const pendente = await conta.criarCodigoSenha(u3.id);
  ok("trocar a senha derruba os outros aparelhos, mantém este e invalida links pendentes", /alterada/.test(okDe(await chamar("usuarios.trocarMinhaSenha", [null, form({ atual: SENHA_TESTE, nova: "nova-senha-123", confirmacao: "nova-senha-123" })], { cookie: c3 }))) && (await pagina(base, "/perfil", c3)).html.includes(u3.email) && !(await pagina(base, "/perfil", c3b)).html.includes(u3.email) && !(await conta.conferirCodigoSenha(pendente)));

  // =====================================================================================
  titulo("4. Links e endereço público");
  const u4 = await usuario(A.org.id, "VENDEDOR");
  const { port } = new URL(base);
  const forjado = await new Promise<number>((res, rej) => {
    // Host e X-Forwarded-Host inventados, com o Origin combinando (passa na conferência do Next).
    const corpo = `------x\r\nContent-Disposition: form-data; name="_1_email"\r\n\r\n${u4.email}\r\n------x\r\nContent-Disposition: form-data; name="0"\r\n\r\n[null,"$K1"]\r\n------x--\r\n`;
    const id = c.idDe("senha.pedirNovaSenha");
    const req = request(
      { host: "127.0.0.1", port, path: "/senha/esqueci", method: "POST", headers: { host: "site-do-mal.test", "x-forwarded-host": "site-do-mal.test", "x-forwarded-proto": "https", origin: "https://site-do-mal.test", "next-action": id, accept: "text/x-component", "content-type": "multipart/form-data; boundary=----x", "content-length": Buffer.byteLength(corpo), "x-real-ip": ipNovo() } },
      (r) => {
        r.resume();
        r.on("end", () => res(r.statusCode ?? 0));
      },
    );
    req.on("error", rej);
    req.end(corpo);
  });
  const mailForjado = await ate(() => email.para(u4.email).at(-1), "e-mail com host forjado");
  ok("Host forjado não muda o link: continua o APP_URL", forjado === 200 && mailForjado.texto.includes("https://crm.exemplo.test/senha/nova?codigo=") && !mailForjado.texto.includes("site-do-mal"));
  const gerou = await chamar("perfil.gerarLinkAgenda", [null], { cookie: cookieA, cabecalhos: { "x-forwarded-proto": "http" } });
  ok("link da agenda usa o APP_URL", ((gerou.valor as { link?: string })?.link ?? "").startsWith("https://crm.exemplo.test/api/agenda/"));
  const cab = (await pagina(base, "/login")).cabecalhos;
  ok("cabeçalhos: nosniff, frame-ancestors, X-Frame-Options, Referrer-Policy; sem X-Powered-By", cab.get("x-content-type-options") === "nosniff" && cab.get("content-security-policy")?.includes("frame-ancestors 'none'") && cab.get("x-frame-options") === "DENY" && cab.get("referrer-policy") === "strict-origin-when-cross-origin" && !cab.get("x-powered-by"));
  ok("páginas com código secreto: Referrer-Policy no-referrer", (await Promise.all(["/convite?codigo=x", "/confirmar?codigo=x", "/senha/nova?codigo=x"].map((p) => pagina(base, p)))).every((r) => r.status === 200 && r.cabecalhos.get("referrer-policy") === "no-referrer"));

  let ruim = await ligar({ APP_URL: undefined });
  const semUrl = criarChamador(ruim.base);
  const antesSemUrl = email.recebidos.length;
  const respostaSemUrl = await semUrl.chamar("senha.pedirNovaSenha", [null, form({ email: u3.email })], { cabecalhos: { ...deIp(), host: "site-do-mal.test" } });
  await ate(() => /\[senha\] não consegui/.test(ruim.saida()), "registro da falha");
  ok("produção sem APP_URL: nenhum link é enviado, a resposta é a mesma e o terminal não mostra o link", /Se existir uma conta/.test(okDe(respostaSemUrl)) && email.recebidos.length === antesSemUrl && !ruim.saida().includes("codigo="));
  const { gerarCodigoAgenda } = await import("../src/lib/agenda");
  ok("produção sem APP_URL: agenda responde 503, sem inventar endereço", (await pagina(ruim.base, `/api/agenda/${await gerarCodigoAgenda(B.admin.id)}.ics`)).status === 503 && /servidor ainda não está configurado/.test(erroDe(await semUrl.chamar("perfil.gerarLinkAgenda", [null], { cookie: cookieA }))));
  ok("ao ligar, avisa o que falta configurar", /\[configuração\] APP_URL/.test(ruim.saida()));
  await desligar(ruim);
  ruim = await ligar({ APP_URL: "http://crm.exemplo.test", PROXY_IP_HEADER: undefined, SMTP_HOST: undefined });
  ok("APP_URL sem https também não serve", /\[configuração\] APP_URL/.test(ruim.saida()));
  await desligar(ruim);

  ruim = await ligar({ PROXY_IP_HEADER: undefined, SMTP_HOST: undefined });
  const semIp = criarChamador(ruim.base);
  const r5 = await semIp.chamar("senha.pedirNovaSenha", [null, form({ email: B.admin.email })]);
  await ate(() => /\[senha\] não consegui/.test(ruim.saida()), "registro da falha de SMTP");
  ok("produção sem SMTP: o link não vai para o terminal, só um aviso genérico", /Se existir/.test(okDe(r5)) && !/codigo=/.test(ruim.saida()) && !ruim.saida().includes(B.admin.email));
  const [uX, uY] = [await usuario(B.org.id, "VENDEDOR"), await usuario(B.org.id, "VENDEDOR")];
  const semCabecalho = await Promise.all(Array.from({ length: 80 }, (_, i) => semIp.chamar("login.entrar", [null, form({ email: uX.email, senha: `e-${i}` })], { cabecalhos: { "x-forwarded-for": `203.0.113.${i}`, "x-real-ip": `203.0.113.${i}` } })));
  ok("sem PROXY_IP_HEADER: 80 tentativas numa conta param no limite por e-mail", semCabecalho.filter((r) => /incorretos/.test(erroDe(r))).length === REGRAS_LOGIN.porEmail);
  ok("e não derrubam as outras pessoas", (await semIp.chamar("login.entrar", [null, form({ email: uY.email, senha: SENHA_TESTE })])).redirecionou === "/");
  const pedidos = await Promise.all(Array.from({ length: 250 }, (_, i) => semIp.chamar("senha.pedirNovaSenha", [null, form({ email: `n${i}@x.test` })])));
  ok("250 pedidos de senha de um só também não travam o \"Esqueci minha senha\" dos outros", pedidos.every((p) => okDe(p)));
  await desligar(ruim);

  // =====================================================================================
  titulo("5. Contas: cadastro e convites pelas telas");
  ok("não existe mais action para definir a senha de outra pessoa", !c.nomes.some((n) => /redefinirSenha|usuarios\.criarUsuario|primeiroAcessoLiberado/.test(n)) && c.nomes.includes("usuarios.convidarUsuario"));
  const cadastrar = (mail: string, extra: Record<string, string> = {}, ip?: string) =>
    chamar("cadastro.criarConta", [null, form({ empresa: "Nova Ltda", ramo: "Outro", nome: "Pessoa Nova", email: mail, telefone: "", termos: "sim", inicio: String(Date.now() - 10_000), ...extra })], { cabecalhos: deIp(ip) });
  const orgsAntes = await db.organizacao.count();
  const novoEmail = `nova-${sufixo()}@x.test`;
  const [respNovo, respExiste] = [await cadastrar(novoEmail, { senha: "senha-do-atacante", confirmacao: "senha-do-atacante" }), await cadastrar(A.admin.email)];
  const semEmail = (r: RespostaAction, e: string) => JSON.stringify(r.valor).replaceAll(e, "E");
  ok("cadastro responde igual para e-mail novo e e-mail com conta", semEmail(respNovo, novoEmail) === semEmail(respExiste, A.admin.email) && (respNovo.valor as { enviadoPara?: string }).enviadoPara === novoEmail);
  const mailNovo = await ate(() => email.para(novoEmail).at(-1), "e-mail do cadastro");
  const mailExiste = await ate(() => email.para(A.admin.email).find((m) => /já tem uma conta/i.test(m.assunto)), "aviso ao dono");
  ok("quem já tem conta recebe um aviso, sem link de acesso", !mailExiste.texto.includes("codigo=") && (await db.cadastroPendente.count({ where: { email: A.admin.email } })) === 0);
  ok("antes de confirmar, não existe empresa nem usuário", (await db.organizacao.count()) === orgsAntes && !(await db.usuario.findUnique({ where: { email: novoEmail } })));
  const codigoNovo = codigoDoLink(mailNovo.texto)!;
  for (let i = 0; i < 3; i++) await pagina(base, `/confirmar?codigo=${codigoNovo}`);
  ok("abrir o link (GET) não gasta; mostra a tela de escolher a senha", (await pagina(base, `/confirmar?codigo=${codigoNovo}`)).html.includes("Escolha a sua senha"));
  const confirmar = (senha: string) => chamar("confirmar.confirmarCadastro", [codigoNovo, null, form({ senha, confirmacao: senha })], { caminho: "/confirmar", cabecalhos: deIp() });
  const confirmacoes = await Promise.all([1, 2, 3].map(() => confirmar("senha-da-pessoa-1")));
  ok("três confirmações ao mesmo tempo: uma empresa, e já entra", confirmacoes.filter((r) => r.redirecionou === "/primeiros-passos" && cookieGravado(r, "crm_sessao")).length === 1 && (await db.organizacao.count()) === orgsAntes + 1);
  ok("vale a senha de quem tem o e-mail, não a de quem cadastrou", (await entrar(novoEmail, "senha-da-pessoa-1")).redirecionou === "/" && /incorretos/.test(erroDe(await entrar(novoEmail, "senha-do-atacante"))));
  ok("campo escondido preenchido (robô): responde igual e não cria nada", (await cadastrar(`robo-${sufixo()}@x.test`, { site: "http://x" })).status === 200 && (await esperar(300), await db.cadastroPendente.count({ where: { email: { startsWith: "robo-" } } })) === 0);
  const ipCadastro = ipNovo();
  const muitos = await Promise.all(Array.from({ length: 12 }, (_, i) => cadastrar(`m${i}-${sufixo()}@x.test`, {}, ipCadastro)));
  ok("12 cadastros juntos do mesmo IP: 5 passam", muitos.filter((r) => (r.valor as { enviadoPara?: string })?.enviadoPara).length === 5);
  ok("e-mail com quebra de linha ou lista é recusado", (await Promise.all(["a@x.test,b@x.test", "a@x.test\r\nBcc: b@x.test"].map((e) => cadastrar(e)))).every((r) => /Confira o e-mail/.test(erroDe(r))));

  const K = await empresa("Empresa K");
  const cookieK = await cookieDe(db, K.admin.id);
  const uK = await usuario(K.org.id, "VENDEDOR");
  const convidar = (mail: string, cookie = cookieK, papel = "VENDEDOR") => chamar("usuarios.convidarUsuario", [null, form({ nome: "Convidada", email: mail, papel })], { cookie });
  const convidada = `conv-${sufixo()}@x.test`;
  const linhaB = JSON.stringify(await db.usuario.findUniqueOrThrow({ where: { id: B.admin.id } }));
  const respConvite = await convidar(convidada);
  const respDeOutra = await convidar(B.admin.email, cookieK, "ADMIN");
  ok("convite responde igual para e-mail novo e para conta de outra empresa", semEmail(respConvite, convidada) === semEmail(respDeOutra, B.admin.email) && okDe(respConvite));
  const telaUsuarios = (await pagina(base, "/usuarios", cookieK)).html;
  ok("e os dois aparecem na lista de convites, sem campo de senha", telaUsuarios.includes(convidada) && telaUsuarios.includes(B.admin.email) && !telaUsuarios.includes('type="password"'));
  const avisoB = await ate(() => email.para(B.admin.email).find((m) => /já tem conta/.test(m.assunto)), "aviso ao dono da conta");
  ok("o dono da conta recebe um aviso sem link, e a conta dele não muda", !avisoB.texto.includes("codigo=") && JSON.stringify(await db.usuario.findUniqueOrThrow({ where: { id: B.admin.id } })) === linhaB);
  ok("e-mail que já está na própria lista: diz", /já está na sua lista/.test(erroDe(await convidar(uK.email))) && /Já existe um convite/.test(erroDe(await convidar(convidada))));
  const codConvite = codigoDoLink((await ate(() => email.para(convidada).at(-1), "convite")).texto)!;
  ok("a resposta da action não traz o link", !respConvite.texto.includes(codConvite) && !respConvite.texto.includes("codigo="));
  const aceitar = (codigo: string, senha: string) => chamar("convite.entrarComConvite", [codigo, null, form({ senha, confirmacao: senha })], { caminho: "/convite", cabecalhos: deIp() });
  const aceites = await Promise.all([1, 2, 3].map(() => aceitar(codConvite, "senha-da-convidada")));
  const nova = await db.usuario.findUnique({ where: { email: convidada } });
  ok("três aceites juntos: um usuário, na empresa certa, com o papel do convite, e já entra", aceites.filter((r) => r.redirecionou === "/" && cookieGravado(r, "crm_sessao")).length === 1 && nova?.organizacaoId === K.org.id && nova.papel === "VENDEDOR" && nova.emailConfirmadoEm);
  ok("convite usado não vale de novo", /não vale mais/.test(erroDe(await aceitar(codConvite, "outra-senha-1"))));
  await db.convite.update({ where: { organizacaoId_email: { organizacaoId: K.org.id, email: B.admin.email } }, data: { expiraEm: new Date(Date.now() - 1000) } });
  ok("convite vencido sai da contagem e pode ser refeito", okDe(await convidar(B.admin.email)));
  // Teto de 6 por empresa nesta configuração do servidor: B tem muitos usuários (ativos).
  ok("teto de usuários por empresa", /Limite de 6 usuários/.test(erroDe(await convidar(`x-${sufixo()}@x.test`, cookieB))));

  const temposDe = async (fazer: (i: number, existe: boolean) => Promise<RespostaAction>, n = 9) => {
    const [sim, nao]: [number[], number[]] = [[], []];
    for (let i = 0; i < n; i++) {
      nao.push((await fazer(i, false)).ms);
      sim.push((await fazer(i, true)).ms);
    }
    return [mediana(sim), mediana(nao)] as const;
  };
  const [te, tn] = await temposDe((i, existe) => chamar("senha.pedirNovaSenha", [null, form({ email: existe ? existentes[i].email : `nada-${i}@x.test` })], { cabecalhos: deIp() }));
  ok(`esqueci a senha: mesmo tempo com e sem conta (medianas ${te.toFixed(1)} e ${tn.toFixed(1)} ms)`, Math.abs(te - tn) < 15);
  const [ce, cn] = await temposDe((i, existe) => cadastrar(existe ? existentes[i].email : `tempo-${i}-${sufixo()}@x.test`));
  ok(`cadastro: mesmo tempo com e sem conta (medianas ${ce.toFixed(1)} e ${cn.toFixed(1)} ms)`, Math.abs(ce - cn) < 15);

  // =====================================================================================
  titulo("6. Webhooks no servidor de produção");
  const criarWh = (url: string, i = 0) => chamar("integracoes.criarWebhook", [null, form({ nome: `t${i}`, url, eventos: ["negocio.ganho"] })], { cookie: cookieA });
  const recusadas = await Promise.all(["http://exemplo.com/", "https://127.0.0.1/", "https://localhost/", "https://[::1]/", "https://10.1.2.3/", "https://169.254.169.254/", "https://evolution/", "https://x.internal/", "https://93.184.216.34:22/"].map(criarWh));
  ok("a tela recusa destinos internos e fora do padrão, mesmo com WEBHOOKS_PERMITIR_LOCAL=1 no .env", recusadas.every((r) => erroDe(r)) && (await db.webhook.count({ where: { organizacaoId: A.org.id } })) === 0);
  ok("controle: IP público com https é aceito (nada é enviado)", okDe(await criarWh("https://93.184.216.34/gancho")) && (await db.webhook.count({ where: { organizacaoId: A.org.id } })) === 1);
  const w = await db.webhook.findFirstOrThrow({ where: { organizacaoId: A.org.id } });
  ok("editar também confere", erroDe(await chamar("integracoes.salvarEventos", [w.id, null, form({ url: `https://127.0.0.1:${portaInterna}/`, eventos: ["negocio.ganho"] })], { cookie: cookieA })) && (await db.webhook.findUniqueOrThrow({ where: { id: w.id } })).url === w.url);
  acessos = 0;
  await db.webhook.update({ where: { id: w.id }, data: { url: `http://127.0.0.1:${portaInterna}/` } }); // como se já estivesse no banco
  const testes: RespostaAction[] = [];
  for (let i = 0; i < 7; i++) testes.push(await chamar("integracoes.testarWebhook", [w.id, null], { cookie: cookieA }));
  ok("endereço interno que já estava no banco não é entregue", testes.slice(0, 5).every((r) => erroDe(r) === "Não entregou: endereço não permitido") && acessos === 0);
  ok("\"Enviar teste\" tem limite (5 por minuto)", testes.slice(5).every((r) => /Muitos testes/.test(erroDe(r))));
  await comEnv({ WEBHOOKS_PERMITIR_LOCAL: "1" }, async () => {
    const falha = createServer((_q, res) => res.writeHead(500).end("SENHA DO BANCO: 123"));
    const pf = await ouvir(falha);
    await db.webhook.update({ where: { id: w.id }, data: { url: `http://127.0.0.1:${pf}/` } });
    await wh.dispararEvento(A.org.id, "negocio.ganho", { x: 1 });
    await wh.processarWebhooks(new Date(Date.now() + 1000), { apenas: [A.org.id] });
    const e = await db.entregaWebhook.findFirstOrThrow({ where: { webhookId: w.id, evento: "negocio.ganho" } });
    ok("o corpo da resposta não é gravado nem aparece na tela", e.erro === "respondeu 500" && !(await pagina(base, "/integracoes", cookieA)).html.includes("SENHA DO BANCO"));
    falha.close();
  });

  // =====================================================================================
  titulo("7. Teto de envios de empresa não aprovada");
  const N = await empresa("Não aprovada", { aprovada: false });
  const euN = usuarioAtual(N.admin, N.org);
  const conversasN = await Promise.all(Array.from({ length: 40 }, () => conversa(N.org.id)));
  const enviarN = (cv: { organizacaoId: string; telefone: string }) => enviarAutomatico(cv, "oi");
  await comEnv({ ENVIOS_DIA_NAO_APROVADA: "10" }, async () => {
    const r = await esperarTudo(conversasN.map(enviarN));
    ok("40 envios ao mesmo tempo com teto 10: saem exatamente 10", r.certos.length === 10 && r.erros.length === 30 && r.erros.every((e) => e instanceof cota.ErroLimiteEnvio) && (await cota.enviosDeHoje(N.org.id)) === 10);
    ok("o contador só conta o que saiu", (await db.mensagemWhatsapp.count({ where: { organizacaoId: N.org.id, direcao: "SAIDA" } })) === 10);
    const quemEscreveu = conversasN[39];
    await db.mensagemWhatsapp.create({ data: { organizacaoId: N.org.id, conversaId: quemEscreveu.id, telefone: quemEscreveu.telefone, direcao: "ENTRADA", conteudo: "oi" } });
    const livres = await esperarTudo(Array.from({ length: 15 }, () => enviarN(quemEscreveu)));
    ok("responder quem escreveu nas últimas 24 h continua livre e não conta", livres.certos.length === 15 && (await cota.enviosDeHoje(N.org.id)) === 10);
    await db.mensagemWhatsapp.updateMany({ where: { conversaId: quemEscreveu.id, direcao: "ENTRADA" }, data: { criadoEm: new Date(Date.now() - 25 * 3600_000) } });
    ok("escreveu há mais de 24 h: conta de novo", (await esperarTudo([enviarN(quemEscreveu)])).erros.length === 1);
    ok("envio manual também para no teto, com explicação", /Limite de 10 mensagens novas por dia/.test((await enviarNaConversa(euN, conversasN[0], { texto: "oi" })).erro ?? ""));
    const atrasada = await db.mensagemAgendada.create({ data: { organizacaoId: N.org.id, conversaId: conversasN[1].id, texto: "agendada", enviarEm: new Date(Date.now() - 60_000) } });
    await processarAgendadas(new Date(), { apenas: [N.org.id], pausaMs: 0 });
    const adiada = await db.mensagemAgendada.findUniqueOrThrow({ where: { id: atrasada.id } });
    ok("agendada e sequência: ficam para amanhã, às 8h", adiada.status === "PENDENTE" && adiada.enviarEm > new Date() && /limite diário/.test(adiada.motivo ?? "") && adiada.enviarEm.toISOString().endsWith("T11:00:00.000Z"));
    ok("no dia seguinte o teto recomeça", cota.diaDe(new Date("2026-11-25T02:59:00Z")) === "2026-11-24" && cota.diaDe(new Date("2026-11-25T03:00:00Z")) === "2026-11-25" && (await cota.comPasse(N.org.id, numeroNovo(), async () => "saiu", new Date(Date.now() + 86_400_000))) === "saiu");
    const aprov = await empresa("Aprovada");
    const cAprov = await Promise.all(Array.from({ length: 25 }, () => conversa(aprov.org.id)));
    ok("empresa aprovada não tem teto (25 de 25) e nada é contado", (await esperarTudo(cAprov.map(enviarN))).certos.length === 25 && (await cota.enviosDeHoje(aprov.org.id)) === 0);
  });
  await comEnv({ WHATSAPP_SIMULAR_ENVIO: undefined, ENVIOS_DIA_NAO_APROVADA: "1000" }, async () => {
    const antes = await cota.enviosDeHoje(N.org.id);
    evolution.modo.falharEnvio = { status: 400, corpo: { response: { message: [{ exists: false, number: "x" }] } } };
    const recusado = await enviarNaConversa(euN, conversasN[2], { texto: "oi" });
    ok("recusado pelo WhatsApp (não saiu): devolve a vaga, com frase clara", recusado.erro === "Este número não tem WhatsApp." && (await cota.enviosDeHoje(N.org.id)) === antes);
    evolution.modo.falharEnvio = { status: 500, corpo: { message: "connect ECONNREFUSED postgres://u:senha@10.0.0.5:5432" } };
    const quebrou = await enviarNaConversa(euN, conversasN[2], { texto: "oi" });
    ok("erro 500 (pode ter saído): conta, e a tela não mostra detalhe interno", (await cota.enviosDeHoje(N.org.id)) === antes + 1 && !/10\.0|postgres|http|ECONN/.test(quebrou.erro ?? "x 10.0"));
    evolution.modo.falharEnvio = null;
  });
  await db.envioDiario.deleteMany({ where: { organizacaoId: N.org.id } });
  await db.mensagemWhatsapp.deleteMany({ where: { organizacaoId: N.org.id } });
  const cookieN = await cookieDe(db, N.admin.id);
  const pelaTela = await Promise.all(conversasN.slice(0, 16).map((cv) => chamar("atendimento.enviarMensagem", [cv.id, null, form({ texto: "oi" })], { cookie: cookieN, caminho: "/atendimento" })));
  ok("pela tela, 16 envios juntos com teto 6: saem 6", pelaTela.filter((r) => (r.valor as { ok?: boolean })?.ok).length === 6 && (await db.mensagemWhatsapp.count({ where: { organizacaoId: N.org.id, direcao: "SAIDA" } })) === 6);
  ok("Primeiros passos mostra o teto e quanto já usou", /começar <!-- -->6<!-- --> por dia \(<!-- -->6<!-- --> hoje\)/.test((await pagina(base, "/primeiros-passos", cookieN)).html));
  await comEnv({ AGENDADAS_PENDENTES_NAO_APROVADA: "8", AGENDADAS_PENDENTES: "12" }, async () => {
    await db.mensagemAgendada.deleteMany({ where: { organizacaoId: N.org.id } });
    const agenda = (eu: typeof euN, cv: (typeof conversasN)[0]) => agendarMensagem(eu, cv, { texto: "x", enviarEm: new Date(Date.now() + 86_400_000), cancelarSeResponder: false });
    const rs = await Promise.all(Array.from({ length: 25 }, () => agenda(euN, conversasN[3])));
    ok("25 agendamentos juntos com teto 8: ficam 8", rs.filter((r) => !("erro" in r)).length === 8 && (await db.mensagemAgendada.count({ where: { organizacaoId: N.org.id, status: "PENDENTE" } })) === 8);
    const cvA = await conversa(A.org.id);
    const ra = await Promise.all(Array.from({ length: 20 }, () => agenda(usuarioAtual(A.admin, A.org), cvA)));
    ok("empresa aprovada também tem teto de agendadas (maior)", ra.filter((r) => !("erro" in r)).length === 12);
    await db.mensagemAgendada.deleteMany({});
  });

  // =====================================================================================
  titulo("8. Justiça no relógio");
  const [X, Y, Z] = [await empresa("Cheia"), await empresa("Pequena 1"), await empresa("Pequena 2")];
  const so = [X.org.id, Y.org.id, Z.org.id];
  const cvX = await conversa(X.org.id);
  await db.mensagemAgendada.createMany({ data: Array.from({ length: 300 }, (_, i) => ({ organizacaoId: X.org.id, conversaId: cvX.id, texto: `${i}`, enviarEm: new Date(Date.now() - 3600_000 + i) })) });
  for (const o of [Y, Z]) await db.mensagemAgendada.create({ data: { organizacaoId: o.org.id, conversaId: (await conversa(o.org.id)).id, texto: "única", enviarEm: new Date(Date.now() - 1000) } });
  const enviadas = (o: { org: { id: string } }) => db.mensagemAgendada.count({ where: { organizacaoId: o.org.id, status: "ENVIADA" } });
  await processarAgendadas(new Date(), { apenas: so, pausaMs: 0 });
  ok("300 agendadas antigas de uma empresa não atrasam as outras: saem na mesma rodada", (await enviadas(Y)) === 1 && (await enviadas(Z)) === 1 && (await enviadas(X)) >= 1 && (await enviadas(X)) <= AGENDADAS_POR_RODADA);
  const primeiraX = await db.mensagemAgendada.findFirstOrThrow({ where: { organizacaoId: X.org.id, status: "PENDENTE" }, orderBy: { enviarEm: "asc" } });
  ok("e dentro da empresa saem na ordem", Number(primeiraX.texto) === (await enviadas(X)));
  const muitas = Array.from({ length: 130 }, (_, i) => `empresa-${i}`);
  const atendidas = new Set([1, 2, 3, 4].flatMap(() => escolherEmpresas("teste", muitas, 40)));
  ok("com 130 empresas na fila, em 4 rodadas de 40 todas foram atendidas", atendidas.size === 130);

  await db.mensagemAgendada.deleteMany({});
  const invalida = await db.conversa.create({ data: { organizacaoId: Y.org.id, telefone: "123", chave: "invalida" } });
  const boa = await conversa(Y.org.id);
  const velha = await conversa(Y.org.id);
  const [m1, m2, m3] = [
    await db.mensagemAgendada.create({ data: { organizacaoId: Y.org.id, conversaId: invalida.id, texto: "com erro", enviarEm: new Date(Date.now() - 5000) } }),
    await db.mensagemAgendada.create({ data: { organizacaoId: Y.org.id, conversaId: boa.id, texto: "boa", enviarEm: new Date(Date.now() - 4000) } }),
    await db.mensagemAgendada.create({ data: { organizacaoId: Y.org.id, conversaId: velha.id, texto: "velha", enviarEm: new Date(Date.now() - 25 * 3600_000) } }),
  ];
  await processarAgendadas(new Date(), { apenas: so, pausaMs: 0 });
  const st = async (id: string) => db.mensagemAgendada.findUniqueOrThrow({ where: { id } });
  ok("uma agendada com erro não para as outras", (await st(m1.id)).status === "ERRO" && (await st(m2.id)).status === "ENVIADA");
  ok("agendada com mais de 24 h de atraso vira erro, não sai", (await st(m3.id)).status === "ERRO" && /24 horas/.test((await st(m3.id)).motivo ?? "") && (await db.mensagemWhatsapp.count({ where: { conversaId: velha.id } })) === 0);

  await comEnv({ WEBHOOKS_PERMITIR_LOCAL: "1" }, async () => {
    const chegou: string[] = [];
    const recebe = createServer((q, res) => {
      chegou.push(q.url ?? "");
      res.end();
    });
    const pr = await ouvir(recebe);
    await db.webhook.deleteMany({});
    for (const [o, n] of [[X, 200], [Y, 1], [Z, 1]] as const) {
      const ww = await db.webhook.create({ data: { organizacaoId: o.org.id, nome: "w", url: `http://127.0.0.1:${pr}/${o.org.id}`, segredo: "s", eventos: ["negocio.ganho"] } });
      await db.entregaWebhook.createMany({ data: Array.from({ length: n }, () => ({ webhookId: ww.id, evento: "negocio.ganho", payload: {}, proximaEm: new Date(Date.now() - (n > 1 ? 3600_000 : 1000)) })) });
    }
    const r = await wh.processarWebhooks(new Date(), { apenas: so });
    ok("webhooks: 200 avisos antigos de uma empresa não atrasam os das outras", chegou.includes(`/${Y.org.id}`) && chegou.includes(`/${Z.org.id}`) && r.vistas <= wh.POR_RODADA && r.entregues === r.vistas);
    recebe.close();
  });
  await comEnv({ WEBHOOKS_PENDENTES: "205" }, async () => {
    for (let i = 0; i < 30; i++) await wh.dispararEvento(X.org.id, "negocio.ganho", { i });
    ok("webhooks: teto de avisos pendentes por empresa", (await db.entregaWebhook.count({ where: { webhook: { organizacaoId: X.org.id }, status: "PENDENTE" } })) === 205);
  });
  const wY = await db.webhook.findFirstOrThrow({ where: { organizacaoId: Y.org.id } });
  await db.entregaWebhook.deleteMany({ where: { webhookId: wY.id } });
  const dias = (n: number) => new Date(Date.now() - n * 86_400_000);
  await db.entregaWebhook.createMany({
    data: [
      { webhookId: wY.id, evento: "a", payload: {}, status: "ENTREGUE", criadoEm: dias(31) },
      { webhookId: wY.id, evento: "b", payload: {}, status: "FALHOU", criadoEm: dias(40) },
      { webhookId: wY.id, evento: "c", payload: {}, status: "ENTREGUE", criadoEm: dias(29) },
      { webhookId: wY.id, evento: "d", payload: {}, status: "PENDENTE", criadoEm: dias(60) },
    ],
  });
  ok("limpeza: apaga concluídas com mais de 30 dias e guarda as recentes e as pendentes", (await wh.limparEntregasAntigas(new Date(), [Y.org.id])) === 2 && (await db.entregaWebhook.findMany({ where: { webhookId: wY.id }, orderBy: { evento: "asc" } })).map((e) => e.evento).join() === "c,d");

  await comEnv({ WHATSAPP_SIMULAR_ENVIO: undefined }, async () => {
    const nomes = await Promise.all([X, Y, Z].map(async (o) => {
      const cfg = await db.configuracaoWhatsapp.update({ where: { organizacaoId: o.org.id }, data: { ativo: true } });
      evolution.instancias.set(cfg.instancia!, { estado: "open" });
      return cfg.instancia!;
    }));
    evolution.modo.travarEstado.add(nomes[0]);
    const t = Date.now();
    const r = await atualizarWebhooksWhatsapp(so);
    ok("um WhatsApp travado não impede atualizar os outros (e desiste em 5 s)", r.total === 3 && r.feitos === 2 && Date.now() - t < 9_000);
    for (const o of [X, Y]) {
      const cv = await conversa(o.org.id);
      await db.campanha.create({ data: { organizacaoId: o.org.id, nome: "c", texto: "Oi", status: "AGENDADA", destinatarios: { create: [{ nome: "n", telefone: cv.telefone, chave: cv.chave, ordem: 0 }] } } });
    }
    const t2 = Date.now();
    await processarCampanhas(new Date("2026-11-18T13:00:00Z"), { apenas: so });
    const daX = await db.campanha.findFirstOrThrow({ where: { organizacaoId: X.org.id } });
    ok("campanhas: instância travada pausa só a dela, e a outra envia", (await db.destinatarioCampanha.count({ where: { campanha: { organizacaoId: Y.org.id }, status: "ENVIADA" } })) === 1 && daX.status === "PAUSADA" && Date.now() - t2 < 9_000);
    evolution.modo.travarEstado.clear();
    evolution.instancias.clear();
  });

  // =====================================================================================
  titulo("9. Certificados ao mesmo tempo");
  const D = await empresa("Escola de Teste");
  const dD = await dadosCompletos(D.org.id, "Cert");
  const ano = new Date().getFullYear();
  const novasMatriculas = async (n: number) => Promise.all(Array.from({ length: n }, async () => db.matricula.create({ data: { turmaId: dD.turma.id, participanteId: (await db.participante.create({ data: { organizacaoId: D.org.id, nome: sufixo() } })).id } })));
  const ms30 = await novasMatriculas(30);
  await esperarTudo(ms30.map((m) => emitirCertificado(D.org, m.id, { validadeAte: null })));
  const numeros = (await db.matricula.findMany({ where: { id: { in: ms30.map((m) => m.id) } } })).map((m) => m.certificadoNumero!).sort();
  ok("30 emissões juntas: 30 números diferentes e em sequência", new Set(numeros).size === 30 && numeros[0] === `EDT-${ano}-0001` && numeros[29] === `EDT-${ano}-0030`);
  const [unica] = await novasMatriculas(1);
  const repetidas = await Promise.all(Array.from({ length: 6 }, () => emitirCertificado(D.org, unica.id, { validadeAte: null })));
  ok("a mesma matrícula aprovada 6 vezes junto: um número só", repetidas.filter(Boolean).length === 1);
  const [m9999, mDepois, mDepois2] = await novasMatriculas(3);
  await db.matricula.update({ where: { id: m9999.id }, data: { certificadoNumero: `EDT-${ano}-9999` } });
  await emitirCertificado(D.org, mDepois.id, { validadeAte: null });
  await emitirCertificado(D.org, mDepois2.id, { validadeAte: null });
  const depoisDe = await db.matricula.findMany({ where: { id: { in: [mDepois.id, mDepois2.id] } }, orderBy: { certificadoNumero: "asc" } });
  ok("depois do 9999 vêm 10000 e 10001 (ordem numérica)", depoisDe.map((m) => m.certificadoNumero).join() === `EDT-${ano}-10000,EDT-${ano}-10001`);
  const intrusa = await emitirCertificado(B.org, unica.id, { validadeAte: null }).then(() => false, () => true);
  ok("outra empresa não emite para a matrícula", intrusa);
  const cookieD = await cookieDe(db, D.admin.id);
  const mTela = await novasMatriculas(8);
  await Promise.all(mTela.map((m) => chamar("turmas.definirResultado", [m.id, true], { cookie: cookieD })));
  const daTela = (await db.matricula.findMany({ where: { id: { in: mTela.map((m) => m.id) } } })).map((m) => m.certificadoNumero);
  ok("pela tela, 8 aprovações juntas: 8 números diferentes", new Set(daTela).size === 8 && daTela.every(Boolean));

  // =====================================================================================
  titulo("10. Tamanhos, espaço e instâncias");
  const cvA = await conversa(A.org.id);
  const grande = Buffer.alloc(16 * 1024 * 1024 - 1000, 7);
  const anexo = await chamar("atendimento.enviarMensagem", [cvA.id, null, form({ texto: "segue", arquivo: new File([grande], "grande.pdf", { type: "application/pdf" }) as unknown as string })], { cookie: cookieA, caminho: "/atendimento" });
  const msgAnexo = await db.mensagemWhatsapp.findFirst({ where: { conversaId: cvA.id, arquivo: { not: null } } });
  ok("anexo de 16 MB pela Central continua funcionando", (anexo.valor as { ok?: boolean })?.ok && msgAnexo?.arquivo);
  const baixado = Buffer.from(await (await fetch(`${base}/api/arquivos/${msgAnexo!.arquivo}`, { headers: { cookie: cookieA } })).arrayBuffer());
  ok("e chega inteiro (não cortado em 10 MB)", baixado.equals(grande));
  const passou17 = await chamar("atendimento.enviarMensagem", [cvA.id, null, form({ texto: "", arquivo: new File([Buffer.alloc(18 * 1024 * 1024)], "x.bin") as unknown as string })], { cookie: cookieA, caminho: "/atendimento" });
  ok("18 MB: recusado (413)", passou17.status === 413);
  const foraDaCentral = await chamar("atendimento.enviarMensagem", [cvA.id, null, form({ texto: "", arquivo: new File([Buffer.alloc(2 * 1024 * 1024)], "x.bin") as unknown as string })], { cookie: cookieA, caminho: "/clientes" });
  ok("2 MB numa tela sem anexo: recusado (413)", foraDaCentral.status === 413);
  ok("100 KB numa tela pública: recusado (413)", (await chamar("login.entrar", [null, form({ email: "a@x.test", senha: "x".repeat(100_000) })], { cabecalhos: deIp() })).status === 413);
  const semTamanho = await new Promise<number>((res, rej) => {
    const req = request({ host: "127.0.0.1", port, path: "/login", method: "POST", headers: { "transfer-encoding": "chunked", "next-action": c.idDe("login.entrar"), "content-type": "text/plain" } }, (r) => {
      r.resume();
      res(r.statusCode ?? 0);
    });
    req.on("error", rej);
    req.end("[]");
  });
  ok("envio sem tamanho declarado: recusado (411)", semTamanho === 411);
  // O Next encaminha para a página certa a action chamada de outra tela (ex.: a pessoa já
  // navegou). Esse pedido interno não declara o tamanho e não pode ser barrado.
  const dA = await dadosCompletos(A.org.id, `Encaminhada${sufixo()}`);
  await chamar("turmas.marcarPresenca", [dA.matricula.id, true], { cookie: cookieA, caminho: "/clientes" });
  ok("action chamada de outra tela (encaminhada pelo Next) continua funcionando", (await db.matricula.findUniqueOrThrow({ where: { id: dA.matricula.id } })).presente === true);

  await comEnv({ ARQUIVOS_MB_POR_EMPRESA: "1" }, async () => {
    const rs = await Promise.all(Array.from({ length: 30 }, () => arquivos.reservarEspaco(B.org.id, 100 * 1024)));
    ok("cota de espaço: 30 arquivos de 100 KB juntos em 1 MB, cabem 10", rs.filter(Boolean).length === 10);
    const cvB = await conversa(B.org.id);
    const recusado = await enviarNaConversa(usuarioAtual(B.admin, B.org), cvB, { arquivo: new File([Buffer.alloc(200 * 1024)], "a.pdf", { type: "application/pdf" }) });
    ok("sem espaço: o anexo não sai e a tela explica", /espaço/.test(recusado.erro ?? "") && (await db.mensagemWhatsapp.count({ where: { conversaId: cvB.id } })) === 0);
    const medida = await empresa("Medida");
    await arquivos.gravarArquivo(medida.org.id, Buffer.alloc(900 * 1024), "application/pdf", "velho.pdf"); // já estava no disco
    ok("arquivos que já existiam entram na conta", !(await arquivos.reservarEspaco(medida.org.id, 200 * 1024)) && (await arquivos.reservarEspaco(medida.org.id, 50 * 1024)));
  });
  const zapA = (await db.configuracaoWhatsapp.findUniqueOrThrow({ where: { organizacaoId: A.org.id } })).instancia;
  const recebeMidia = async (bytes: number, id: string) => {
    const tel = numeroNovo();
    const r = await fetch(`${base}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-crm-segredo": "segredo-de-teste-do-webhook" },
      body: JSON.stringify({ event: "messages.upsert", instance: zapA, data: { key: { id, remoteJid: `${tel}@s.whatsapp.net` }, message: { documentMessage: { caption: "contrato", mimetype: "application/pdf", fileName: "c.pdf" }, base64: Buffer.alloc(bytes, 1).toString("base64") }, messageTimestamp: Math.floor(Date.now() / 1000) } }),
    });
    return { status: r.status, msg: await db.mensagemWhatsapp.findFirst({ where: { telefone: tel } }) };
  };
  const [pequena, media, enorme] = [await recebeMidia(100_000, "mid-1"), await recebeMidia(2_000_000, "mid-2"), await recebeMidia(6_000_000, "mid-3")];
  ok("mídia recebida dentro do limite é guardada", pequena.msg?.arquivo);
  ok("acima do limite (1 MB neste teste): a mensagem entra, sem o arquivo e com aviso", media.status === 200 && media.msg && !media.msg.arquivo && /grande demais/.test(media.msg.conteudo));
  ok("muito acima: o aviso é recusado (422) sem carregar tudo", enorme.status === 422 && !enorme.msg);

  await comEnv({ INSTANCIAS_WHATSAPP: "3", WHATSAPP_SIMULAR_ENVIO: undefined }, async () => {
    const r = await esperarTudo(Array.from({ length: 8 }, (_, i) => evo.garantirInstancia(`inst-${i}`)));
    ok("teto de instâncias: 8 criações juntas, ficam 3", evolution.instancias.size === 3 && r.certos.length === 3 && r.erros.every((e) => /limite de números/.test((e as Error).message)));
    const jaTem = await esperarTudo([...evolution.instancias.keys()].map((i) => evo.garantirInstancia(i)));
    ok("quem já tem instância continua conseguindo reconfigurar", jaTem.certos.length === 3 && evolution.instancias.size === 3);
  });
  evolution.instancias.clear();
  const conectou = await chamar("whatsapp.iniciarConexao", [], { cookie: cookieA });
  ok("administrador de empresa confirmada conecta (QR Code)", (conectou.valor as { qr?: string })?.qr?.startsWith("data:image") && evolution.instancias.has(zapA!));
  await evolution.fechar();
  const foraDoAr = await chamar("whatsapp.iniciarConexao", [], { cookie: cookieA });
  ok("Evolution fora do ar: a tela não mostra o endereço interno", /não respondeu/.test(erroDe(foraDoAr)) && !/127\.0\.0\.1|http|localhost/.test(erroDe(foraDoAr)));

  console.log(`\n${totalPassou()} verificações passaram.`);
} finally {
  for (const x of [...servidores]) await x.desligar();
  await email.fechar();
  await evolution.fechar().catch(() => {});
  await db.$disconnect();
  await banco.apagar();
  rmSync(pastaArquivos, { recursive: true, force: true });
  console.log("Servidores desligados e banco de teste apagado.");
}
process.exit(); // sobras de conexões dos servidores de mentira não seguram o terminal
