import "server-only";
// Agendar mensagens e iniciar sequências de follow-up numa conversa.
// Quem envia na hora certa é o relógio (./relogio.ts).
import type { Conversa } from "@/generated/prisma/client";
import type { UsuarioAtual } from "@/lib/auth";
import { db } from "@/lib/db";
import { obterAutomacao } from "./config";
import { proximaAbertura } from "./horario";

type ConversaBase = Pick<Conversa, "id" | "organizacaoId">;

export async function agendarMensagem(
  eu: UsuarioAtual,
  conversa: ConversaBase,
  dados: { texto: string; enviarEm: Date; cancelarSeResponder: boolean },
) {
  return db.mensagemAgendada.create({
    data: {
      organizacaoId: conversa.organizacaoId,
      conversaId: conversa.id,
      usuarioId: eu.id,
      texto: dados.texto,
      enviarEm: dados.enviarEm,
      cancelarSeResponder: dados.cancelarSeResponder,
    },
  });
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

  await db.$transaction([
    db.mensagemAgendada.updateMany({
      where: { conversaId: conversa.id, status: "PENDENTE", sequenciaId: { not: null } },
      data: { status: "CANCELADA", motivo: "outra sequência foi iniciada" },
    }),
    db.mensagemAgendada.createMany({
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
    }),
  ]);
  return sequencia;
}
