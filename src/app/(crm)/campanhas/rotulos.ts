import type { StatusCampanha, StatusDestinatario } from "@/generated/prisma/client";

export const STATUS: Record<StatusCampanha, { rotulo: string; cor: string }> = {
  RASCUNHO: { rotulo: "Rascunho", cor: "#64748b" },
  AGENDADA: { rotulo: "Agendada", cor: "#7c3aed" },
  ENVIANDO: { rotulo: "Enviando", cor: "#0284c7" },
  PAUSADA: { rotulo: "Pausada", cor: "#d97706" },
  CONCLUIDA: { rotulo: "Concluída", cor: "#16a34a" },
  CANCELADA: { rotulo: "Cancelada", cor: "#dc2626" },
};

export const STATUS_DESTINATARIO: Record<StatusDestinatario, { rotulo: string; cor: string }> = {
  PENDENTE: { rotulo: "Na fila", cor: "#64748b" },
  ENVIANDO: { rotulo: "Enviando", cor: "#0284c7" },
  ENVIADA: { rotulo: "Enviada", cor: "#0284c7" },
  ERRO: { rotulo: "Erro", cor: "#dc2626" },
  IGNORADA: { rotulo: "Fora", cor: "#94a3b8" },
};
