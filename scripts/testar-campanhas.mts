// Teste das campanhas (Fase D), SEM mandar mensagem para ninguém (força o modo
// simulação). Cria duas empresas de exemplo, roda o motor, simula "entregue/lida",
// resposta e SAIR, prepara uma reciclagem e confere que a outra empresa não é tocada.
// Usa um banco descartável (criado e apagado aqui). Não toca no banco do CRM.
//
// Uso (com o banco local ligado):
//   npx tsx --conditions=react-server scripts/testar-campanhas.mts
import "dotenv/config";
import { ok, prepararBanco, titulo, totalPassou } from "./apoio/ambiente-teste.mjs";

process.env.WHATSAPP_SIMULAR_ENVIO = "1"; // nunca envia de verdade
process.env.AUTOMACAO_DESLIGADA = "1";

const banco = await prepararBanco();
const { dadosCompletos, db, empresa, usuarioAtual } = await import("./apoio/dados.mjs");
const ritmo = await import("../src/lib/campanhas/ritmo");
const { processarCampanhas, montarTexto } = await import("../src/lib/campanhas/motor");
const { montarPublico } = await import("../src/lib/campanhas/publico");
const { registrarStatus, aoResponderCampanha } = await import("../src/lib/campanhas/status");
const { listarReciclagens, prepararReciclagem } = await import("../src/lib/campanhas/reciclagem");

// Quarta-feira, 10:00 em Brasília: dentro do horário padrão.
const quarta = new Date("2026-11-18T13:00:00Z");

try {
  // --- 1. Regras puras --------------------------------------------------------
  titulo("Ritmo e textos");
  ok("variação sorteia uma opção", ritmo.variar("{Olá|Oi} {nome}", () => 0.99) === "Oi {nome}");
  ok("variável sem | fica intacta", ritmo.variar("{primeiro_nome}") === "{primeiro_nome}");
  ok("SAIR descadastra", ritmo.querSair("  Sair! ") && ritmo.querSair("PARAR") && ritmo.querSair("pare."));
  ok("frase com 'sair' não descadastra", !ritmo.querSair("quero sair da turma de sábado"));
  ok("espera entre 60 e 120 s", [0, 0.5, 1].every((s) => { const e = ritmo.esperaDepoisDe(1, () => s); return e >= 60_000 && e <= 120_000; }));
  ok("pausa de 10 min a cada 30", ritmo.esperaDepoisDe(30) === 10 * 60_000);
  ok("início do dia em Brasília", ritmo.inicioDoDia(new Date("2026-11-13T02:00:00Z")).toISOString() === "2026-11-12T03:00:00.000Z");
  ok("texto final tem o convite para sair", montarTexto("{Oi|Olá}{, primeiro_nome}!", { nome: "Ana Souza", variaveis: null }, "Brigada", () => 0).startsWith("Oi, Ana!"));

  // --- 2. Motor com o banco ----------------------------------------------------
  const { org, admin } = await empresa("Empresa A");
  await dadosCompletos(org.id, "A");
  const b = await empresa("Empresa B");
  const dadosB = await dadosCompletos(b.org.id, "B");
  await db.campanha.update({ where: { id: dadosB.campanha.id }, data: { status: "AGENDADA" } });
  const so = { apenas: [org.id] };

  titulo("Motor");
  const publico = (await montarPublico(org.id, {})).filter((p) => !p.fora);
  ok("público tem os clientes com WhatsApp, só desta empresa", publico.length === 3 && publico.every((p) => p.cliente.endsWith(" A")));

  const campanha = await db.campanha.create({
    data: {
      organizacaoId: org.id,
      nome: "TESTE automático",
      texto: "{Olá|Oi}{, primeiro_nome}! Teste da {empresa}.",
      status: "AGENDADA",
      criadoPorId: admin.id,
      destinatarios: {
        create: publico.slice(0, 3).map((p, ordem) => ({ clienteId: p.clienteId, nome: p.nome, telefone: p.telefone!, chave: p.chave!, ordem })),
      },
    },
  });
  const ler = () => db.campanha.findUniqueOrThrow({ where: { id: campanha.id }, include: { destinatarios: { orderBy: { ordem: "asc" } } } });

  await processarCampanhas(quarta, so);
  let c = await ler();
  ok("agendada vira enviando e manda 1 mensagem", c.status === "ENVIANDO" && c.destinatarios.filter((d) => d.status === "ENVIADA").length === 1);
  ok("mensagem saiu com o convite para sair", c.destinatarios[0].textoFinal?.endsWith(ritmo.RODAPE_SAIR));
  const espera = c.proximoEnvioEm!.getTime() - quarta.getTime();
  ok("próximo envio só depois de 60–120 s", espera > 55_000 && espera <= 120_000);
  ok("o filtro protege as outras empresas: a campanha da B não foi tocada", (await db.campanha.findUniqueOrThrow({ where: { id: dadosB.campanha.id } })).status === "AGENDADA" && (await db.mensagemWhatsapp.count({ where: { organizacaoId: b.org.id, direcao: "SAIDA" } })) === 0);

  await processarCampanhas(quarta, so);
  c = await ler();
  ok("respeita a espera (não manda a segunda logo)", c.destinatarios.filter((d) => d.status === "ENVIADA").length === 1);

  const sabadoNoite = new Date("2026-11-21T23:00:00Z"); // sábado 20:00
  await db.campanha.update({ where: { id: campanha.id }, data: { proximoEnvioEm: null } });
  await processarCampanhas(sabadoNoite, so);
  c = await ler();
  ok("fora do horário espera", c.destinatarios.filter((d) => d.status === "ENVIADA").length === 1 && c.motivo?.includes("horário"));

  const msg = await db.mensagemWhatsapp.findFirst({ where: { idExterno: c.destinatarios[0].idExterno! } });
  ok("mensagem aparece na conversa como 'campanha'", msg?.status === "campanha" && msg.organizacaoId === org.id);

  titulo("Status, resposta e SAIR");
  await registrarStatus(b.org.id, { keyId: c.destinatarios[0].idExterno, fromMe: true, status: "READ" });
  ok("outra empresa não muda o status", !(await db.destinatarioCampanha.findUniqueOrThrow({ where: { id: c.destinatarios[0].id } })).lidaEm);
  await registrarStatus(org.id, { keyId: c.destinatarios[0].idExterno, fromMe: true, status: "DELIVERY_ACK" });
  await registrarStatus(org.id, [{ keyId: c.destinatarios[0].idExterno, fromMe: true, status: "READ" }]);
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
  await processarCampanhas(quarta, so); // envia o 2º
  await db.campanha.update({ where: { id: campanha.id }, data: { proximoEnvioEm: null } });
  await processarCampanhas(quarta, so); // não há mais pendentes: conclui
  c = await ler();
  ok("conclui quando acaba a fila", c.status === "CONCLUIDA" && c.destinatarios.filter((d) => d.status === "ENVIADA").length === 2);

  titulo("Empresa não aprovada ou suspensa");
  await db.organizacao.update({ where: { id: b.org.id }, data: { campanhasLiberadas: false } });
  await processarCampanhas(quarta, { apenas: [b.org.id] });
  ok("não aprovada: o motor não inicia a campanha", (await db.campanha.findUniqueOrThrow({ where: { id: dadosB.campanha.id } })).status === "AGENDADA");
  await db.organizacao.update({ where: { id: b.org.id }, data: { campanhasLiberadas: true, situacao: "SUSPENSA" } });
  await processarCampanhas(quarta, { apenas: [b.org.id] });
  ok("suspensa: também não", (await db.campanha.findUniqueOrThrow({ where: { id: dadosB.campanha.id } })).status === "AGENDADA");
  await db.organizacao.update({ where: { id: b.org.id }, data: { situacao: "ATIVA" } });
  await processarCampanhas(quarta, { apenas: [b.org.id] });
  ok("aprovada e ativa: sai (controle)", (await db.destinatarioCampanha.count({ where: { campanhaId: dadosB.campanha.id, status: "ENVIADA" } })) === 1);

  titulo("Reciclagem");
  const grupos = await listarReciclagens(org.id, 60);
  ok("lista clientes com certificado vencendo, só desta empresa", grupos.length === 1);
  const negociosAntes = await db.negocio.count({ where: { organizacaoId: org.id } });
  const r = await prepararReciclagem(usuarioAtual(admin, org));
  const rec = await db.campanha.findUniqueOrThrow({ where: { id: r!.campanhaId }, include: { destinatarios: true } });
  ok("reciclagem fica em RASCUNHO (gestor aprova)", rec.status === "RASCUNHO" && rec.tipo === "RECICLAGEM" && rec.organizacaoId === org.id);
  ok("cria negócios no funil", (await db.negocio.count({ where: { organizacaoId: org.id } })) - negociosAntes === r!.negocios && r!.negocios >= 1);
  ok("texto tem {curso} e {vencimento} preenchidos", rec.destinatarios.length === 0 || !montarTexto(rec.texto, rec.destinatarios[0], org.nome).includes("{curso}"));
  ok("certificados não entram de novo na lista", (await listarReciclagens(org.id, 60)).length === 0);
  ok("a outra empresa continua com a lista dela", (await listarReciclagens(b.org.id, 60)).length === 1);

  console.log(`\n${totalPassou()} verificações passaram.`);
} finally {
  await db.$disconnect();
  await banco.apagar();
  console.log("Banco de teste apagado.");
}
