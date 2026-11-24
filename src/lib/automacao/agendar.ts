import "server-only";
// Agendar mensagens e iniciar sequências de follow-up numa conversa.
// Quem envia na hora certa é o relógio (./relogio.ts).
//
// Cada empresa tem um teto de mensagens esperando (LIMITES.agendadasPendentes), contado
// com trava no banco: agendamentos ao mesmo tempo não passam do teto.
import type { Conversa, Prisma } from "@/generated/prisma/client";
import { LIMITES } from "@/lib/ambiente";
import type { UsuarioAtual } from "@/lib/auth";
import { db } from "@/lib/db";
import { ESPERA_TRAVA, travar } from "@/lib/trava";
import { obterAutomacao } from "./config";
import { proximaAbertura } from "./horario";

type ConversaBase = Pick<Conversa, "id" | "organizacaoId">;

/** Cabem mais `novas` mensagens na fila da empresa? Devolve o erro, ou null. */
async function passouDoTeto(tx: Prisma.TransactionClient, organizacaoId: string, novas: number) {
  await travar(tx, "agendadas", organizacaoId);
  const org = await tx.organizacao.findUniqueOrThrow({ where: { id: organizacaoId }, select: { campanhasLiberadas: true } });
  const teto = LIMITES.agendadasPendentes(org.campanhasLiberadas);
  const naFila = await tx.mensagemAgendada.count({ where: { organizacaoId, status: { in: ["PENDENTE", "ENVIANDO"] } } });
  return naFila + novas > teto ? { erro: `Limite de ${teto} mensagens agendadas esperando. Cancele alguma ou espere as próximas saírem.` } : null;
}

export async function agendarMensagem(
  eu: UsuarioAtual,
  conversa: ConversaBase,
  dados: { texto: string; enviarEm: Date; cancelarSeResponder: boolean },
) {
  return db.$transaction(async (tx) => {
    const erro = await passouDoTeto(tx, conversa.organizacaoId, 1);
    if (erro) return erro;
    return tx.mensagemAgendada.create({
      data: {
        organizacaoId: conversa.organizacaoId,
        conversaId: conversa.id,
        usuarioId: eu.id,
        texto: dados.texto,
        enviarEm: dados.enviarEm,
        cancelarSeResponder: dados.cancelarSeResponder,
      },
    });
  }, ESPERA_TRAVA);
}

/**
 * Agenda todos os passos da sequência a partir de agora. Se o horário de
 * atendimento estiver ligado, um passo que cairia com a empresa fechada vai
 * para a próxima abertura. Uma conversa tem no máximo uma sequência ativa:
 * a anterior é cancelada.
 */
export async function iniciarSequencia(eu: UsuarioAtual, conversa: ConversaBase, sequenciaId: string) {
  const sequencia = await db.sequencia.findFirst({
    where: { id: sequenciaId, organizacaoId: conversa.organizacaoId },
    include: { passos: { orderBy: { ordem: "asc" } } },
  });
  if (!sequencia || sequencia.passos.length === 0) return null;
  const config = await obterAutomacao(conversa.organizacaoId);
  const inicio = Date.now();

  const erro = await db.$transaction(async (tx) => {
    const cheio = await passouDoTeto(tx, conversa.organizacaoId, sequencia.passos.length);
    if (cheio) return cheio;
    await tx.mensagemAgendada.updateMany({
      where: { conversaId: conversa.id, status: "PENDENTE", sequenciaId: { not: null } },
      data: { status: "CANCELADA", motivo: "outra sequência foi iniciada" },
    });
    await tx.mensagemAgendada.createMany({
      data: sequencia.passos.map((p) => {
        const quando = new Date(inicio + p.esperaMinutos * 60_000);
        return {
          organizacaoId: conversa.organizacaoId,
          conversaId: conversa.id,
          usuarioId: eu.id,
          sequenciaId: sequencia.id,
          texto: p.texto,
          enviarEm: config.horarioAtivo ? proximaAbertura(config.horarios, quando) : quando,
          cancelarSeResponder: true,
        };
      }),
    });
    return null;
  }, ESPERA_TRAVA);
  return erro ?? sequencia;
}
