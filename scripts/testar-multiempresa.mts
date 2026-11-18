// Teste da Fase F1 (várias empresas no mesmo CRM).
// Cria uma SEGUNDA empresa no banco local e confere que ela e a Brigada não
// enxergam nada uma da outra: telas, exportação, arquivos, WhatsApp e automação.
// Também confere a empresa suspensa. No fim, APAGA tudo o que criou.
//
// Uso (com o banco local e o CRM ligados: npm run db:local e npm run dev):
//   npx tsx --conditions=react-server scripts/testar-multiempresa.mts
// Outro endereço: CRM_URL=http://localhost:3001 npx tsx ...
import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

process.env.WHATSAPP_SIMULAR_ENVIO = "1";
process.env.AUTOMACAO_DESLIGADA = "1";
const BASE = process.env.CRM_URL ?? "http://localhost:3000";

const { db } = await import("../src/lib/db");
const { criarEmpresa, ErroCadastro } = await import("../src/lib/empresas/criar");
const { empresaLiberada, motivoBloqueio, ondeLiberada } = await import("../src/lib/empresas/situacao");
const { gerarSlug, nomeInstancia } = await import("../src/lib/empresas/preparar");
const { empresaDaInstancia, instanciaDaEmpresa } = await import("../src/lib/whatsapp/instancia");
const { aoReceberDoCliente } = await import("../src/lib/automacao/ao-receber");

let passou = 0;
function ok(nome: string, condicao: unknown) {
  assert.ok(condicao, nome);
  passou++;
  console.log(`  ✔ ${nome}`);
}

// --- 1. Regras puras -----------------------------------------------------------
console.log("Situação da empresa");
const hoje = new Date("2026-11-18T12:00:00Z");
const amanha = new Date("2026-11-19T12:00:00Z");
ok("ativa entra", empresaLiberada({ situacao: "ATIVA", testeAte: null }, hoje));
ok("em teste entra até o fim do teste", empresaLiberada({ situacao: "EM_TESTE", testeAte: amanha }, hoje) && !empresaLiberada({ situacao: "EM_TESTE", testeAte: hoje }, amanha));
ok("suspensa não entra, com aviso", !empresaLiberada({ situacao: "SUSPENSA", testeAte: null }, hoje) && /suspenso/.test(motivoBloqueio({ situacao: "SUSPENSA", testeAte: null }, hoje)!));
ok("teste vencido tem aviso próprio", /teste/.test(motivoBloqueio({ situacao: "EM_TESTE", testeAte: hoje }, amanha)!));
ok("slug sem acento e sem espaço", gerarSlug("Clínica São José Ltda.") === "clinica-sao-jose-ltda" && gerarSlug("!!!") === "empresa");

// --- 2. Preparação ---------------------------------------------------------------
try {
  const r = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(String(r.status));
} catch {
  console.error(`\nO CRM não respondeu em ${BASE}. Ligue com "npm run dev" e rode de novo.`);
  process.exit(1);
}

const slugA = process.env.ORG_SLUG ?? "brigada-mg";
const orgA = await db.organizacao.findFirstOrThrow({ where: { slug: slugA } });
const adminA = await db.usuario.findFirstOrThrow({ where: { organizacaoId: orgA.id, papel: "ADMIN", ativo: true } });
const clienteA = await db.cliente.findFirstOrThrow({ where: { organizacaoId: orgA.id }, orderBy: { criadoEm: "asc" } });

const sufixo = randomBytes(3).toString("hex");
const NOME_B = `Empresa Teste Isolamento ${sufixo}`;
const CLIENTE_B = `Cliente Só Da Empresa B ${sufixo}`;
const criadas: string[] = [];
const sessoes: string[] = [];

/** Cria uma sessão direto no banco e devolve o cookie (como o login faria). */
async function cookieDe(usuarioId: string) {
  const token = randomBytes(32).toString("base64url");
  const s = await db.sessao.create({
    data: { usuarioId, tokenHash: createHash("sha256").update(token).digest("hex"), expiraEm: new Date(Date.now() + 3600_000), navegador: "teste" },
  });
  sessoes.push(s.id);
  return `crm_sessao=${token}`;
}
const pagina = async (caminho: string, cookie: string) => {
  const r = await fetch(`${BASE}${caminho}`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(60_000) });
  return { status: r.status, html: await r.text() };
};

try {
  console.log("Empresa nova");
  const { org: orgB, admin: adminB } = await criarEmpresa({
    nome: NOME_B,
    admin: { nome: "Admin B", email: `admin-${sufixo}@empresa-b.test`, senha: "senha-de-teste-123" },
    diasTeste: 14,
  });
  criadas.push(orgB.id);
  const [etapas, etiquetas, automacao, zap] = await Promise.all([
    db.etapaFunil.findMany({ where: { organizacaoId: orgB.id } }),
    db.etiqueta.count({ where: { organizacaoId: orgB.id } }),
    db.configuracaoAutomacao.findUnique({ where: { organizacaoId: orgB.id } }),
    db.configuracaoWhatsapp.findUnique({ where: { organizacaoId: orgB.id } }),
  ]);
  ok("nasce em teste por 14 dias", orgB.situacao === "EM_TESTE" && Math.round((orgB.testeAte!.getTime() - Date.now()) / 86_400_000) === 14);
  ok("já tem funil (com Ganho e Perdido), etiquetas e automação desligada", etapas.length >= 3 && etapas.some((e) => e.tipo === "GANHO") && etapas.some((e) => e.tipo === "PERDIDO") && etiquetas > 0 && automacao && !automacao.botAtivo && !automacao.horarioAtivo);
  ok("primeiro usuário é administrador", adminB.papel === "ADMIN" && adminB.organizacaoId === orgB.id);
  ok("instância própria de WhatsApp", zap?.instancia === nomeInstancia(orgB.slug) && (await instanciaDaEmpresa(orgA.id)) !== zap?.instancia);

  let recusou = "";
  await criarEmpresa({ nome: "Outra", admin: { nome: "X", email: adminB.email.toUpperCase(), senha: "senha-de-teste-123" } }).catch((e) => (recusou = e instanceof ErroCadastro ? e.message : ""));
  ok("e-mail já usado em outra empresa é recusado", /já tem conta/.test(recusou));
  const { org: orgB2 } = await criarEmpresa({ nome: NOME_B, admin: { nome: "Y", email: `y-${sufixo}@empresa-b.test`, senha: "senha-de-teste-123" } });
  criadas.push(orgB2.id);
  ok("mesmo nome ganha outro slug", orgB2.slug === `${orgB.slug}-2` && orgB2.situacao === "ATIVA");

  await db.cliente.create({ data: { organizacaoId: orgB.id, nome: CLIENTE_B } });

  console.log("Telas (uma empresa não vê a outra)");
  const [cookieA, cookieB] = await Promise.all([cookieDe(adminA.id), cookieDe(adminB.id)]);
  const vistaA = await pagina("/clientes", cookieA);
  const vistaB = await pagina("/clientes", cookieB);
  ok("Brigada vê os clientes dela, e não os da empresa B", vistaA.html.includes(clienteA.nome) && !vistaA.html.includes(CLIENTE_B));
  ok("empresa B vê só os dela", vistaB.html.includes(CLIENTE_B) && !vistaB.html.includes(clienteA.nome));
  for (const caminho of ["/", "/funil", "/atendimento", "/turmas", "/relatorios", "/relatorios?aba=vendas", "/campanhas", "/usuarios", "/integracoes"]) {
    const { html } = await pagina(caminho, cookieB);
    ok(`${caminho}: nada da Brigada`, !html.includes(clienteA.nome) && !html.includes(adminA.email));
  }
  const ficha = await pagina(`/clientes/${clienteA.id}`, cookieB);
  ok("ficha de cliente da Brigada não abre para a empresa B", !ficha.html.includes(clienteA.nome));
  const csv = await pagina("/api/exportar/clientes.csv", cookieB);
  ok("exportação CSV só tem os clientes dela", csv.status === 200 && csv.html.includes(CLIENTE_B) && !csv.html.includes(clienteA.nome));
  const arquivo = await pagina(`/api/arquivos/${orgA.id}/2026-11/qualquer.jpg`, cookieB);
  ok("arquivo de mídia da Brigada não abre", arquivo.status === 404);

  console.log("WhatsApp (cada número é de uma empresa)");
  const segredo = process.env.WHATSAPP_WEBHOOK_SEGREDO ?? "";
  const avisar = async (instance: string, telefone: string, id: string) => {
    const r = await fetch(`${BASE}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-crm-segredo": segredo },
      body: JSON.stringify({
        event: "messages.upsert",
        instance,
        data: { key: { id, remoteJid: `${telefone}@s.whatsapp.net`, fromMe: false }, pushName: "Fulano B", message: { conversation: "oi, quero um orçamento" }, messageTimestamp: Math.floor(Date.now() / 1000) },
      }),
    });
    return r.json() as Promise<{ salvas?: number; ignorada?: string }>;
  };
  const numeroAleatorio = () => `553190${Math.floor(1_000_000 + Math.random() * 8_999_999)}`; // celular de BH, 13 dígitos
  const telB = numeroAleatorio();
  const r1 = await avisar(zap!.instancia!, telB, `teste-iso-${sufixo}-1`);
  const conversaB = await db.conversa.findFirst({ where: { telefone: telB } });
  ok("mensagem do número da empresa B cai na empresa B", r1.salvas === 1 && conversaB?.organizacaoId === orgB.id);
  const telX = numeroAleatorio();
  const r2 = await avisar(`instancia-que-nao-existe-${sufixo}`, telX, `teste-iso-${sufixo}-2`);
  ok("instância desconhecida é ignorada (não cai na Brigada)", r2.ignorada && (await db.conversa.count({ where: { telefone: telX } })) === 0);
  ok("a instância diz de quem é", (await empresaDaInstancia(zap!.instancia)) === orgB.id && (await empresaDaInstancia("nenhuma")) === null);

  console.log("Empresa suspensa");
  await db.configuracaoAutomacao.update({ where: { organizacaoId: orgB.id }, data: { botAtivo: true } });
  await db.organizacao.update({ where: { id: orgB.id }, data: { situacao: "SUSPENSA" } });
  const exportSuspensa = await pagina("/api/exportar/clientes.csv", cookieB);
  ok("a sessão deixa de valer na hora", exportSuspensa.status === 401);
  // Como se fosse a primeira mensagem da conversa (é quando o chatbot cumprimenta).
  const recebida = { conversa: { ...conversaB!, ultimaTexto: null }, tipo: "TEXTO" as const, conteudo: "oi", criadoEm: new Date() };
  await aoReceberDoCliente(recebida);
  const saidas = () => db.mensagemWhatsapp.count({ where: { conversaId: conversaB!.id, direcao: "SAIDA" } });
  ok("chatbot não responde", (await saidas()) === 0);
  await db.mensagemAgendada.create({ data: { organizacaoId: orgB.id, conversaId: conversaB!.id, texto: "follow-up", enviarEm: new Date(Date.now() - 60_000) } });
  const prontas = () => db.mensagemAgendada.count({ where: { organizacaoId: orgB.id, status: "PENDENTE", enviarEm: { lte: new Date() }, conversa: { organizacao: ondeLiberada() } } });
  ok("o relógio não pega as agendadas dela", (await prontas()) === 0);
  await db.organizacao.update({ where: { id: orgB.id }, data: { situacao: "EM_TESTE", testeAte: new Date(Date.now() - 1000) } });
  ok("teste vencido também bloqueia", (await pagina("/api/exportar/clientes.csv", cookieB)).status === 401 && (await prontas()) === 0);

  await db.organizacao.update({ where: { id: orgB.id }, data: { situacao: "ATIVA" } });
  ok("ativada, volta a entrar", (await pagina("/api/exportar/clientes.csv", cookieB)).status === 200);
  ok("e o relógio volta a pegar as agendadas", (await prontas()) === 1);
  await aoReceberDoCliente(recebida);
  ok("e o chatbot volta a responder", (await saidas()) > 0);

  console.log(`\n${passou} verificações passaram.`);
} finally {
  await db.sessao.deleteMany({ where: { id: { in: sessoes } } });
  await db.organizacao.deleteMany({ where: { id: { in: criadas } } }); // o resto apaga junto (cascade)
  console.log(`Limpeza feita (${criadas.length} empresa(s) de teste e ${sessoes.length} sessão(ões) apagadas).`);
  await db.$disconnect();
}
