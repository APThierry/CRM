import "server-only";
// Motor das campanhas: chamado pelo relógio (src/lib/automacao/relogio.ts) a cada 30 s.
//
// Em cada rodada, para cada organização com campanha ativa, envia NO MÁXIMO UMA
// mensagem, e só se:
// - já passou a espera sorteada desde o envio anterior (campanha.proximoEnvioEm);
// - a empresa está no horário de atendimento;
// - não bateu o limite do dia (todas as campanhas somadas);
// - o WhatsApp está conectado (senão a campanha pausa sozinha).
// As regras de ritmo estão em ./ritmo.ts.
import type { Prisma } from "@/generated/prisma/client";
import { preencherVariaveis } from "@/lib/atendimento";
import { obterAutomacao } from "@/lib/automacao/config";
import { estaAberto } from "@/lib/automacao/horario";
import { db } from "@/lib/db";
import { enviarAutomatico } from "@/lib/whatsapp/enviar";
import { ErroWhatsapp, estadoConexao, simulandoEnvio } from "@/lib/whatsapp/evolution";
import { chavesDescadastradas } from "./publico";
import { esperaDepoisDe, inicioDoDia, RITMO, RODAPE_SAIR, variar } from "./ritmo";

/** Envios de campanha da organização hoje (horário de Brasília). */
export async function enviadasHoje(organizacaoId: string, agora = new Date()) {
  return db.destinatarioCampanha.count({
    where: { campanha: { organizacaoId }, status: "ENVIADA", enviadaEm: { gte: inicioDoDia(agora) } },
  });
}

/** Texto final para um destinatário: variáveis, variação sorteada e o convite para sair. */
export function montarTexto(
  texto: string,
  d: { nome: string; variaveis: Prisma.JsonValue | null },
  empresa: string,
  sortear?: () => number,
) {
  const extras = (d.variaveis ?? {}) as Record<string, string>;
  let final = preencherVariaveis(variar(texto, sortear), { nome: d.nome, empresa });
  for (const [chave, valor] of Object.entries(extras)) final = final.replaceAll(`{${chave}}`, String(valor));
  return final.trim() + RODAPE_SAIR;
}

async function pausar(campanhaId: string, motivo: string) {
  await db.campanha.update({ where: { id: campanhaId }, data: { status: "PAUSADA", motivo } });
  console.log(`[campanhas] campanha ${campanhaId} pausada: ${motivo}`);
}

export async function processarCampanhas(agora = new Date()) {
  // Envio interrompido (servidor caiu no meio)? Não reenvia: marca erro.
  await db.destinatarioCampanha.updateMany({
    where: { status: "ENVIANDO", campanha: { proximoEnvioEm: { lt: new Date(agora.getTime() - 10 * 60_000) } } },
    data: { status: "ERRO", motivo: "envio interrompido (o servidor reiniciou?)" },
  });

  // Agendadas que chegaram na hora viram "enviando" (se não houver outra enviando na organização).
  const agendadas = await db.campanha.findMany({
    where: { status: "AGENDADA", OR: [{ iniciarEm: null }, { iniciarEm: { lte: agora } }] },
    orderBy: [{ iniciarEm: "asc" }, { criadoEm: "asc" }],
  });
  for (const c of agendadas) {
    const ocupada = await db.campanha.count({ where: { organizacaoId: c.organizacaoId, status: "ENVIANDO" } });
    if (ocupada) continue;
    await db.campanha.update({
      where: { id: c.id },
      data: { status: "ENVIANDO", iniciadaEm: c.iniciadaEm ?? agora, proximoEnvioEm: agora, motivo: null },
    });
  }

  const ativas = await db.campanha.findMany({
    where: { status: "ENVIANDO" },
    include: { organizacao: { select: { nome: true } } },
  });
  let enviadas = 0;
  for (const campanha of ativas) {
    if (campanha.proximoEnvioEm && campanha.proximoEnvioEm > agora) continue;
    if (await enviarUma(campanha, agora)) enviadas++;
  }
  return { enviadas, ativas: ativas.length };
}

type CampanhaAtiva = Prisma.CampanhaGetPayload<{ include: { organizacao: { select: { nome: true } } } }>;

async function enviarUma(campanha: CampanhaAtiva, agora: Date) {
  const org = campanha.organizacaoId;
  const config = await obterAutomacao(org);
  if (!estaAberto(config.horarios, agora)) {
    if (campanha.motivo !== "aguardando o horário de atendimento") {
      await db.campanha.update({ where: { id: campanha.id }, data: { motivo: "aguardando o horário de atendimento" } });
    }
    return false;
  }
  if ((await enviadasHoje(org, agora)) >= RITMO.limitePorDia) {
    await db.campanha.update({ where: { id: campanha.id }, data: { motivo: `limite de ${RITMO.limitePorDia} mensagens por dia atingido; continua amanhã` } });
    return false;
  }

  const proximo = await db.destinatarioCampanha.findFirst({
    where: { campanhaId: campanha.id, status: "PENDENTE" },
    orderBy: { ordem: "asc" },
  });
  if (!proximo) {
    await db.campanha.update({ where: { id: campanha.id }, data: { status: "CONCLUIDA", concluidaEm: agora, motivo: null, proximoEnvioEm: null } });
    console.log(`[campanhas] campanha "${campanha.nome}" concluída`);
    return false;
  }

  if (!simulandoEnvio()) {
    const { estado } = await estadoConexao();
    if (estado !== "open") {
      await pausar(campanha.id, "o WhatsApp está desconectado. Conecte e clique em Retomar.");
      return false;
    }
  }

  // Pediu para sair depois que a campanha foi montada?
  if ((await chavesDescadastradas(org)).has(proximo.chave)) {
    await db.destinatarioCampanha.update({ where: { id: proximo.id }, data: { status: "IGNORADA", motivo: "pediu para sair" } });
    return false;
  }

  const reservou = await db.destinatarioCampanha.updateMany({ where: { id: proximo.id, status: "PENDENTE" }, data: { status: "ENVIANDO" } });
  if (!reservou.count) return false;
  // A reserva (ENVIANDO) impede envio duplo. Guardamos a hora da tentativa: se o
  // servidor cair no meio, depois de 10 min o destinatário vira ERRO (não reenvia).
  await db.campanha.update({ where: { id: campanha.id }, data: { proximoEnvioEm: agora, motivo: null } });

  const texto = montarTexto(campanha.texto, proximo, campanha.organizacao.nome);
  try {
    const { idExterno } = await enviarAutomatico({ organizacaoId: org, telefone: proximo.telefone }, texto, null, "campanha");
    await db.destinatarioCampanha.update({
      where: { id: proximo.id },
      data: { status: "ENVIADA", enviadaEm: agora, textoFinal: texto, idExterno, motivo: null },
    });
    const total = await db.destinatarioCampanha.count({ where: { campanhaId: campanha.id, status: "ENVIADA" } });
    await db.campanha.update({
      where: { id: campanha.id },
      data: { proximoEnvioEm: new Date(agora.getTime() + esperaDepoisDe(total)) },
    });
    return true;
  } catch (e) {
    const motivo = e instanceof ErroWhatsapp ? e.message : "erro inesperado no envio";
    console.error(`[campanhas] não consegui enviar para ${proximo.telefone}:`, e);
    await db.destinatarioCampanha.update({ where: { id: proximo.id }, data: { status: "ERRO", motivo: motivo.slice(0, 300) } });
    await db.campanha.update({ where: { id: campanha.id }, data: { proximoEnvioEm: new Date(agora.getTime() + esperaDepoisDe(0)) } });

    // Erros seguidos: algo está errado (número bloqueado, WhatsApp caiu). Pausa.
    // Os envios seguem a `ordem`, então os últimos tentados são os de ordem maior.
    const ultimas = await db.destinatarioCampanha.findMany({
      where: { campanhaId: campanha.id, status: { in: ["ENVIADA", "ERRO"] } },
      orderBy: { ordem: "desc" },
      take: RITMO.errosParaPausar,
      select: { status: true },
    });
    if (ultimas.length === RITMO.errosParaPausar && ultimas.every((u) => u.status === "ERRO")) {
      await pausar(campanha.id, `${RITMO.errosParaPausar} erros seguidos. Confira o WhatsApp antes de retomar.`);
    }
    return false;
  }
}
