import "server-only";
// Autorização de envio: TODA mensagem que sai pelo WhatsApp passa por aqui. As funções
// de src/lib/whatsapp/evolution.ts só aceitam um "passe", e só este arquivo cria passes.
//
// Empresa ainda não aprovada (campanhasLiberadas = false) tem um teto por dia de
// mensagens que ELA começa: manual, agendada, sequência, o que for. Responder quem
// escreveu nas últimas 24 horas é livre e não conta (inclusive o chatbot e o aviso de
// fora do horário, que sempre respondem alguém). Empresa aprovada não tem teto aqui.
//
// O contador fica no banco e sobe numa instrução só (INSERT ... ON CONFLICT ... WHERE
// total < teto): cem envios ao mesmo tempo não passam do teto.
import { LIMITES } from "@/lib/ambiente";
import { db } from "@/lib/db";
import { chaveTelefone } from "@/lib/formatar";
import { ErroWhatsapp } from "./evolution";
import { instanciaDaEmpresa } from "./instancia";

declare const selo: unique symbol;
/** Prova de que o envio foi autorizado. Só `comPasse` cria. */
export type Passe = { readonly instancia: string; readonly [selo]: true };

export class ErroLimiteEnvio extends ErroWhatsapp {}

const JANELA_RESPOSTA = 24 * 3600_000;

/** Dia no horário de Brasília (UTC-3): "2026-11-24". */
export const diaDe = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);

/** O cliente escreveu para a empresa nas últimas 24 horas? */
async function estaRespondendo(organizacaoId: string, telefone: string, agora: Date) {
  const chave = chaveTelefone(telefone);
  if (!chave) return false;
  const recebida = await db.mensagemWhatsapp.findFirst({
    where: { direcao: "ENTRADA", criadoEm: { gte: new Date(agora.getTime() - JANELA_RESPOSTA) }, conversa: { organizacaoId, chave } },
    select: { id: true },
  });
  return recebida !== null;
}

/** Conta mais um envio de hoje, se couber no teto. */
async function contarEnvio(organizacaoId: string, dia: string, teto: number) {
  if (teto <= 0) return false;
  const gravou = await db.$executeRaw`
    INSERT INTO "EnvioDiario" ("organizacaoId", dia, total) VALUES (${organizacaoId}, ${dia}, 1)
    ON CONFLICT ("organizacaoId", dia) DO UPDATE SET total = "EnvioDiario".total + 1 WHERE "EnvioDiario".total < ${teto}`;
  return gravou === 1;
}

const devolverEnvio = (organizacaoId: string, dia: string) =>
  db.$executeRaw`UPDATE "EnvioDiario" SET total = total - 1 WHERE "organizacaoId" = ${organizacaoId} AND dia = ${dia} AND total > 0`;

/** Quantas mensagens novas a empresa já começou hoje. */
export async function enviosDeHoje(organizacaoId: string, agora = new Date()) {
  const hoje = await db.envioDiario.findUnique({ where: { organizacaoId_dia: { organizacaoId, dia: diaDe(agora) } }, select: { total: true } });
  return hoje?.total ?? 0;
}

/**
 * Autoriza e faz UM envio. Se o WhatsApp recusar (a mensagem com certeza não saiu), o
 * envio não conta. Na dúvida (ex.: demorou demais), conta.
 */
export async function comPasse<T>(organizacaoId: string, telefone: string, enviar: (passe: Passe) => Promise<T>, agora = new Date()): Promise<T> {
  const org = await db.organizacao.findUniqueOrThrow({ where: { id: organizacaoId }, select: { campanhasLiberadas: true } });
  const dia = diaDe(agora);
  let contou = false;
  if (!org.campanhasLiberadas && !(await estaRespondendo(organizacaoId, telefone, agora))) {
    const teto = LIMITES.enviosPorDia();
    if (!(await contarEnvio(organizacaoId, dia, teto))) {
      throw new ErroLimiteEnvio(
        `Limite de ${teto} mensagens novas por dia atingido (a conta ainda não foi aprovada). Você continua podendo responder quem escreveu nas últimas 24 horas.`,
      );
    }
    contou = true;
  }
  try {
    return await enviar({ instancia: await instanciaDaEmpresa(organizacaoId) } as Passe);
  } catch (e) {
    if (contou && e instanceof ErroWhatsapp && !e.talvezEnviado) await devolverEnvio(organizacaoId, dia);
    throw e;
  }
}
