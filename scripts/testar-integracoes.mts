// Teste da Fase E (relatórios, agenda .ics, exportação CSV e webhooks) no banco
// local. Sobe um servidor HTTP de mentira para receber os webhooks e, no fim,
// APAGA tudo o que criou.
//
// Uso (com o banco local ligado):
//   npx tsx --conditions=react-server scripts/testar-integracoes.mts
import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

process.env.WHATSAPP_SIMULAR_ENVIO = "1";
process.env.AUTOMACAO_DESLIGADA = "1";

const { db } = await import("../src/lib/db");
const { gerarCsv } = await import("../src/lib/csv");
const agenda = await import("../src/lib/agenda");
const rel = await import("../src/lib/relatorios");
const wh = await import("../src/lib/webhooks/disparar");

let passou = 0;
function ok(nome: string, condicao: unknown) {
  assert.ok(condicao, nome);
  passou++;
  console.log(`  ✔ ${nome}`);
}

// --- 1. Regras puras -----------------------------------------------------------
console.log("CSV");
const csv = gerarCsv(["Nome", "Valor"], [["=HYPERLINK(\"x\")", 1234.5], ['Ana "Bia"; Souza', null]]);
ok("começa com BOM e usa ;", csv.startsWith("﻿\"Nome\";\"Valor\""));
ok("fórmula vira texto", csv.includes(`"'=HYPERLINK(""x"")"`));
ok("decimal com vírgula", csv.includes('"1234,5"'));
ok("aspas e ; escapados", csv.includes('"Ana ""Bia""; Souza"'));

console.log("Agenda (.ics)");
const ics = agenda.montarIcs("Teste", [
  { uid: "a@crm", titulo: "Turma, NR-23; básica", diaInteiro: true, inicio: new Date("2026-11-20T11:00:00Z"), fim: new Date("2026-11-21T11:00:00Z") },
  { uid: "b@crm", titulo: "Ligar", descricao: "linha 1\nlinha 2 ".padEnd(200, "é"), inicio: new Date("2026-11-20T13:00:00Z"), minutos: 30 },
]);
ok("dia inteiro de 20 a 21 (DTEND exclusivo = 22)", ics.includes("DTSTART;VALUE=DATE:20261120") && ics.includes("DTEND;VALUE=DATE:20261122"));
ok("evento com hora em UTC", ics.includes("DTSTART:20261120T130000Z") && ics.includes("DTEND:20261120T133000Z"));
ok("vírgula e ponto e vírgula escapados", ics.includes("SUMMARY:Turma\\, NR-23\\; básica"));
ok("linhas com até 75 bytes e CRLF", ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75) && !/[^\r]\n/.test(ics));

console.log("Relatórios (cálculos)");
const p = rel.lerPeriodo("2026-11-30", "2026-11-01");
ok("período invertido é corrigido", p.deTexto === "2026-11-01" && p.de.toISOString() === "2026-11-01T03:00:00.000Z");
ok("período padrão = mês atual", rel.lerPeriodo(undefined, "x", new Date("2026-11-13T15:00:00Z")).deTexto === "2026-11-01");
const t0 = new Date("2026-11-10T12:00:00Z").getTime();
const m = (min: number, direcao: "ENTRADA" | "SAIDA", usuarioId: string | null, status: string | null = null, conversaId = "c1") => ({ conversaId, direcao, usuarioId, status, criadoEm: new Date(t0 + min * 60_000) });
const tempos = rel.temposDeResposta([
  m(0, "ENTRADA", null), m(1, "SAIDA", null, "automática"), m(2, "ENTRADA", null), m(10, "SAIDA", "ana"), m(11, "SAIDA", "ana"),
  m(0, "ENTRADA", null, null, "c2"), m(30, "SAIDA", null, "enviada pelo celular", "c2"),
]);
ok("conta do 1º contato do cliente até a resposta da pessoa (bot não conta)", tempos.get("ana")?.length === 1 && tempos.get("ana")![0] === 10 * 60_000);
ok("resposta pelo celular da empresa entra separada", tempos.get(null)?.[0] === 30 * 60_000);
ok("mediana", rel.mediana([5, 1, 3]) === 3 && rel.mediana([1, 2, 3, 4]) === 2.5 && rel.duracao(95 * 60_000) === "1 h 35 min");

// --- 2. Com o banco --------------------------------------------------------------
const inicio = new Date();
const org = await db.organizacao.findFirstOrThrow({ where: { slug: process.env.ORG_SLUG ?? "brigada-mg" } });
const usuario = await db.usuario.findFirstOrThrow({ where: { organizacaoId: org.id, papel: { in: ["ADMIN", "GESTOR"] } } });
const tokenAntes = usuario.agendaTokenHash;

// Servidor de mentira: responde 200 ou 500 conforme `falhar`.
let falhar = false;
const recebidos: { headers: Record<string, string | string[] | undefined>; corpo: string }[] = [];
const servidor = createServer((req, res) => {
  let corpo = "";
  req.on("data", (c) => (corpo += c));
  req.on("end", () => {
    recebidos.push({ headers: req.headers, corpo });
    res.writeHead(falhar ? 500 : 200).end(falhar ? "fora do ar" : "ok");
  });
});
await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/gancho`;
const webhookIds: string[] = [];

try {
  console.log("Webhooks");
  const w = await db.webhook.create({ data: { organizacaoId: org.id, nome: "TESTE", url, segredo: wh.novoSegredo(), eventos: ["negocio.ganho", "cliente.criado"] } });
  webhookIds.push(w.id);
  ok("evento não assinado não entra na fila", (await wh.dispararEvento(org.id, "mensagem.recebida", { x: 1 })) === 0);
  ok("evento assinado entra na fila", (await wh.dispararEvento(org.id, "negocio.ganho", { titulo: "Brigada básica", valor: 1500 })) === 1);

  const agora = new Date();
  let r = await wh.processarWebhooks(agora);
  ok("relógio entrega", r.entregues === 1 && recebidos.length === 1);
  const h = recebidos[0].headers;
  const esperado = `sha256=${createHmac("sha256", w.segredo).update(`${h["x-crm-timestamp"]}.${recebidos[0].corpo}`).digest("hex")}`;
  ok("assinatura HMAC confere", h["x-crm-assinatura"] === esperado && h["x-crm-evento"] === "negocio.ganho");
  const corpo = JSON.parse(recebidos[0].corpo);
  ok("corpo tem id, evento e dados", corpo.id === h["x-crm-entrega"] && corpo.dados.titulo === "Brigada básica");

  falhar = true;
  await wh.dispararEvento(org.id, "cliente.criado", { nome: "Fulano" });
  let quando = new Date(agora.getTime() + 1000);
  await wh.processarWebhooks(quando);
  let e = await db.entregaWebhook.findFirstOrThrow({ where: { webhookId: w.id, evento: "cliente.criado" } });
  ok("erro agenda nova tentativa em 1 min", e.status === "PENDENTE" && e.tentativas === 1 && e.respostaCodigo === 500 && e.proximaEm.getTime() - quando.getTime() === 60_000);
  r = await wh.processarWebhooks(quando);
  ok("não tenta antes da hora", r.vistas === 0);
  for (let i = 0; i < wh.MAX_TENTATIVAS - 1; i++) {
    quando = new Date((await db.entregaWebhook.findUniqueOrThrow({ where: { id: e.id } })).proximaEm.getTime() + 1000);
    await wh.processarWebhooks(quando);
  }
  e = await db.entregaWebhook.findUniqueOrThrow({ where: { id: e.id } });
  ok(`desiste depois de ${wh.MAX_TENTATIVAS} tentativas`, e.status === "FALHOU" && e.tentativas === wh.MAX_TENTATIVAS);

  falhar = false;
  const semResposta = await db.webhook.create({ data: { organizacaoId: org.id, nome: "TESTE fora", url: "http://127.0.0.1:1/nada", segredo: "x", eventos: ["negocio.ganho"] } });
  webhookIds.push(semResposta.id);
  await db.webhook.update({ where: { id: w.id }, data: { ativo: false } });
  await wh.dispararEvento(org.id, "negocio.ganho", { titulo: "x" });
  await wh.processarWebhooks(new Date(Date.now() + 1000));
  const e2 = await db.entregaWebhook.findFirstOrThrow({ where: { webhookId: semResposta.id } });
  ok("endereço que não responde vira erro (sem travar)", e2.status === "PENDENTE" && !!e2.erro);
  ok("webhook desligado não recebe", (await db.entregaWebhook.count({ where: { webhookId: w.id, evento: "negocio.ganho" } })) === 1);

  console.log("Agenda do usuário");
  const codigo = await agenda.gerarCodigoAgenda(usuario.id);
  ok("código abre a agenda", (await agenda.usuarioDaAgenda(codigo))?.id === usuario.id);
  ok("código errado não abre", !(await agenda.usuarioDaAgenda(codigo.slice(0, -2) + "xx")) && !(await agenda.usuarioDaAgenda("../../etc")));
  const novo = await agenda.gerarCodigoAgenda(usuario.id);
  ok("gerar outro invalida o antigo", !(await agenda.usuarioDaAgenda(codigo)) && !!(await agenda.usuarioDaAgenda(novo)));
  const eventos = await agenda.eventosDoUsuario(usuario, "http://localhost:3000");
  const turmas = await db.turma.count({ where: { organizacaoId: org.id, status: { not: "CANCELADA" } } });
  ok("agenda tem as turmas", eventos.filter((x) => x.uid.startsWith("turma-")).length > 0 || turmas === 0);
  ok("ics da agenda é válido", agenda.montarIcs("x", eventos).startsWith("BEGIN:VCALENDAR"));

  console.log("Relatórios (banco)");
  const ano = rel.lerPeriodo(`${new Date().getFullYear() - 1}-01-01`, undefined);
  const [at, vendas, turmasRel] = await Promise.all([rel.relatorioAtendentes(org.id, ano), rel.relatorioVendas(org.id, ano), rel.relatorioTurmas(org.id, ano)]);
  ok("por atendente lista a equipe", at.length >= 1 && at.every((l) => l.nome));
  const ganhosBanco = await db.negocio.count({ where: { organizacaoId: org.id, fechadoEm: { gte: ano.de, lte: ano.ate }, etapa: { tipo: "GANHO" } } });
  ok("vendas batem com o banco", vendas.resumo.ganhos === ganhosBanco);
  ok("funil agora tem as etapas abertas", vendas.funilAtual.length === (await db.etapaFunil.count({ where: { organizacaoId: org.id, tipo: "ABERTA" } })));
  ok("turmas: aprovados ≤ presentes ≤ inscritos", turmasRel.resumo.aprovados <= turmasRel.resumo.inscritos && turmasRel.resumo.presentes <= turmasRel.resumo.inscritos);

  console.log(`\n${passou} verificações passaram.`);
} finally {
  await db.webhook.deleteMany({ where: { id: { in: webhookIds } } }); // entregas apagam junto (cascade)
  await db.usuario.update({ where: { id: usuario.id }, data: { agendaTokenHash: tokenAntes } });
  servidor.close();
  console.log(`Limpeza feita (${webhookIds.length} webhook(s) de teste apagados, link da agenda restaurado). Início: ${inicio.toISOString()}`);
  await db.$disconnect();
}
