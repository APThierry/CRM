// Teste das campanhas (Fase D) no banco local, SEM mandar mensagem para ninguém
// (força o modo simulação). Cria uma campanha de teste, roda o motor, simula
// "entregue/lida", resposta e SAIR, prepara uma reciclagem e, no fim, APAGA tudo
// o que criou (campanhas, negócios, notas, conversas, mensagens, descadastros).
//
// Uso (com o banco local ligado):
//   npx tsx --conditions=react-server scripts/testar-campanhas.mts
import "dotenv/config";
import assert from "node:assert/strict";

process.env.WHATSAPP_SIMULAR_ENVIO = "1"; // nunca envia de verdade
process.env.AUTOMACAO_DESLIGADA = "1";

const { db } = await import("../src/lib/db");
const ritmo = await import("../src/lib/campanhas/ritmo");
const { processarCampanhas, montarTexto } = await import("../src/lib/campanhas/motor");
const { montarPublico } = await import("../src/lib/campanhas/publico");
const { registrarStatus, aoResponderCampanha } = await import("../src/lib/campanhas/status");
const { listarReciclagens, prepararReciclagem } = await import("../src/lib/campanhas/reciclagem");

let passou = 0;
function ok(nome: string, condicao: unknown) {
  assert.ok(condicao, nome);
  passou++;
  console.log(`  ✔ ${nome}`);
}

// --- 1. Regras puras --------------------------------------------------------
console.log("Ritmo e textos");
ok("variação sorteia uma opção", ritmo.variar("{Olá|Oi} {nome}", () => 0.99) === "Oi {nome}");
ok("variável sem | fica intacta", ritmo.variar("{primeiro_nome}") === "{primeiro_nome}");
ok("SAIR descadastra", ritmo.querSair("  Sair! ") && ritmo.querSair("PARAR") && ritmo.querSair("pare."));
ok("frase com 'sair' não descadastra", !ritmo.querSair("quero sair da turma de sábado"));
ok("espera entre 60 e 120 s", [0, 0.5, 1].every((s) => { const e = ritmo.esperaDepoisDe(1, () => s); return e >= 60_000 && e <= 120_000; }));
ok("pausa de 10 min a cada 30", ritmo.esperaDepoisDe(30) === 10 * 60_000);
ok("início do dia em Brasília", ritmo.inicioDoDia(new Date("2026-11-13T02:00:00Z")).toISOString() === "2026-11-12T03:00:00.000Z");
ok("texto final tem o convite para sair", montarTexto("{Oi|Olá}{, primeiro_nome}!", { nome: "Ana Souza", variaveis: null }, "Brigada", () => 0).startsWith("Oi, Ana!") );

// --- 2. Motor com o banco ----------------------------------------------------
const inicio = new Date();
const org = await db.organizacao.findFirstOrThrow({ where: { slug: process.env.ORG_SLUG ?? "brigada-mg" } });
const usuario = await db.usuario.findFirstOrThrow({ where: { organizacaoId: org.id, papel: { in: ["ADMIN", "GESTOR"] } } });
const matriculasAntes = await db.matricula.findMany({ where: { turma: { organizacaoId: org.id } }, select: { id: true, reciclagemEm: true, validadeAte: true } });
const conversasAntes = await db.conversa.findMany({
  where: { organizacaoId: org.id },
  select: { id: true, ultimaEm: true, ultimaTexto: true, ultimaDirecao: true, naoLidas: true, status: true },
});
// Quarta-feira, 10:00 em Brasília: dentro do horário padrão.
const quarta = new Date("2026-11-18T13:00:00Z");
const campanhasCriadas: string[] = [];

try {
  console.log("Motor");
  const publico = (await montarPublico(org.id, {})).filter((p) => !p.fora);
  ok("público tem clientes com WhatsApp", publico.length >= 2);

  const campanha = await db.campanha.create({
    data: {
      organizacaoId: org.id,
      nome: "TESTE automático",
      texto: "{Olá|Oi}{, primeiro_nome}! Teste da {empresa}.",
      status: "AGENDADA",
      criadoPorId: usuario.id,
      destinatarios: {
        create: publico.slice(0, 3).map((p, ordem) => ({ clienteId: p.clienteId, nome: p.nome, telefone: p.telefone!, chave: p.chave!, ordem })),
      },
    },
    include: { destinatarios: { orderBy: { ordem: "asc" } } },
  });
  campanhasCriadas.push(campanha.id);

  await processarCampanhas(quarta);
  let c = await db.campanha.findUniqueOrThrow({ where: { id: campanha.id }, include: { destinatarios: { orderBy: { ordem: "asc" } } } });
  ok("agendada vira enviando e manda 1 mensagem", c.status === "ENVIANDO" && c.destinatarios.filter((d) => d.status === "ENVIADA").length === 1);
  ok("mensagem saiu com o convite para sair", c.destinatarios[0].textoFinal?.endsWith(ritmo.RODAPE_SAIR));
  const espera = c.proximoEnvioEm!.getTime() - quarta.getTime();
  ok("próximo envio só depois de 60–120 s", espera > 55_000 && espera <= 120_000);

  await processarCampanhas(quarta);
  c = await db.campanha.findUniqueOrThrow({ where: { id: campanha.id }, include: { destinatarios: { orderBy: { ordem: "asc" } } } });
  ok("respeita a espera (não manda a segunda logo)", c.destinatarios.filter((d) => d.status === "ENVIADA").length === 1);

  const sabadoNoite = new Date("2026-11-21T23:00:00Z"); // sábado 20:00
  await db.campanha.update({ where: { id: campanha.id }, data: { proximoEnvioEm: null } });
  await processarCampanhas(sabadoNoite);
  c = await db.campanha.findUniqueOrThrow({ where: { id: campanha.id }, include: { destinatarios: { orderBy: { ordem: "asc" } } } });
  ok("fora do horário espera", c.destinatarios.filter((d) => d.status === "ENVIADA").length === 1 && c.motivo?.includes("horário"));

  const msg = await db.mensagemWhatsapp.findFirst({ where: { idExterno: c.destinatarios[0].idExterno! } });
  ok("mensagem aparece na conversa como 'campanha'", msg?.status === "campanha");

  console.log("Status, resposta e SAIR");
  await registrarStatus({ keyId: c.destinatarios[0].idExterno, fromMe: true, status: "DELIVERY_ACK" });
  await registrarStatus([{ keyId: c.destinatarios[0].idExterno, fromMe: true, status: "READ" }]);
  let d0 = await db.destinatarioCampanha.findUniqueOrThrow({ where: { id: c.destinatarios[0].id } });
  ok("entregue e lida registradas", d0.entregueEm && d0.lidaEm);

  await aoResponderCampanha({ organizacaoId: org.id, telefone: d0.telefone, conteudo: "Tenho interesse", tipo: "TEXTO" });
  d0 = await db.destinatarioCampanha.findUniqueOrThrow({ where: { id: d0.id } });
  ok("resposta marca 'respondeu'", d0.respondeuEm);

  const d2 = c.destinatarios[2];
  const saiu = await aoResponderCampanha({ organizacaoId: org.id, telefone: d2.telefone, conteudo: "SAIR", tipo: "TEXTO" });
  const d2depois = await db.destinatarioCampanha.findUniqueOrThrow({ where: { id: d2.id } });
  ok("SAIR descadastra e tira da fila", saiu && d2depois.status === "IGNORADA");
  ok("descadastrado fica de fora do próximo público", (await montarPublico(org.id, {})).find((p) => p.chave === d2.chave)?.fora === "pediu para sair");

  await db.campanha.update({ where: { id: campanha.id }, data: { proximoEnvioEm: null } });
  await processarCampanhas(quarta); // envia o 2º
  await db.campanha.update({ where: { id: campanha.id }, data: { proximoEnvioEm: null } });
  await processarCampanhas(quarta); // não há mais pendentes: conclui
  c = await db.campanha.findUniqueOrThrow({ where: { id: campanha.id }, include: { destinatarios: true } });
  ok("conclui quando acaba a fila", c.status === "CONCLUIDA" && c.destinatarios.filter((d) => d.status === "ENVIADA").length === 2);

  console.log("Reciclagem");
  // Garante um certificado vencendo para o teste.
  const alvo = await db.matricula.findFirst({ where: { aprovado: true, turma: { organizacaoId: org.id }, participante: { clienteId: { not: null } } } });
  if (alvo) {
    await db.matricula.update({ where: { id: alvo.id }, data: { reciclagemEm: null, validadeAte: new Date(Date.now() + 20 * 86_400_000) } });
  }
  const grupos = await listarReciclagens(org.id, 60);
  ok("lista clientes com certificado vencendo", grupos.length >= 1);
  const negociosAntes = await db.negocio.count({ where: { organizacaoId: org.id } });
  const eu = { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel, assinaturaWhatsapp: false, organizacao: { id: org.id, nome: org.nome, slug: org.slug } };
  const r = await prepararReciclagem(eu);
  campanhasCriadas.push(r!.campanhaId);
  const rec = await db.campanha.findUniqueOrThrow({ where: { id: r!.campanhaId }, include: { destinatarios: true } });
  ok("reciclagem fica em RASCUNHO (gestor aprova)", rec.status === "RASCUNHO" && rec.tipo === "RECICLAGEM");
  ok("cria negócios no funil", (await db.negocio.count({ where: { organizacaoId: org.id } })) - negociosAntes === r!.negocios && r!.negocios >= 1);
  ok("texto tem {curso} e {vencimento} preenchidos", rec.destinatarios.length === 0 || !montarTexto(rec.texto, rec.destinatarios[0], org.nome).includes("{curso}"));
  ok("certificados não entram de novo na lista", (await listarReciclagens(org.id, 60)).length === 0);

  console.log(`\n${passou} verificações passaram.`);
} finally {
  // --- Limpeza: devolve o banco como estava --------------------------------
  const negociosReciclagem = await db.destinatarioCampanha.findMany({ where: { campanhaId: { in: campanhasCriadas }, negocioId: { not: null } }, select: { negocioId: true } });
  await db.negocio.deleteMany({ where: { organizacaoId: org.id, titulo: { startsWith: "Reciclagem " }, criadoEm: { gte: inicio } } });
  await db.atividade.deleteMany({ where: { organizacaoId: org.id, descricao: { startsWith: "Reciclagem:" }, criadoEm: { gte: inicio } } });
  await db.campanha.deleteMany({ where: { id: { in: campanhasCriadas } } });
  await db.descadastro.deleteMany({ where: { organizacaoId: org.id, criadoEm: { gte: inicio } } });
  await db.mensagemWhatsapp.deleteMany({ where: { organizacaoId: org.id, criadoEm: { gte: inicio } } });
  await db.conversa.deleteMany({ where: { organizacaoId: org.id, criadoEm: { gte: inicio } } });
  for (const m of matriculasAntes) await db.matricula.update({ where: { id: m.id }, data: { reciclagemEm: m.reciclagemEm, validadeAte: m.validadeAte } });
  for (const { id, ...resumo } of conversasAntes) await db.conversa.update({ where: { id }, data: resumo });
  console.log(`Limpeza feita (${campanhasCriadas.length} campanha(s), ${negociosReciclagem.length} negócio(s) de reciclagem apagados).`);
  await db.$disconnect();
}
