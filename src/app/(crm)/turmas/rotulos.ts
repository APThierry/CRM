// Nomes e cores mostrados na tela para os valores guardados no banco.
export const statusTurma: Record<string, { rotulo: string; cor: string }> = {
  PLANEJADA: { rotulo: "Planejada", cor: "#64748b" },
  CONFIRMADA: { rotulo: "Confirmada", cor: "#0284c7" },
  REALIZADA: { rotulo: "Realizada", cor: "#16a34a" },
  CANCELADA: { rotulo: "Cancelada", cor: "#dc2626" },
};

export const modalidade: Record<string, string> = { PRESENCIAL: "Presencial", EAD: "EAD", HIBRIDO: "Híbrido" };

export const situacao: Record<string, { rotulo: string; cor: string }> = {
  valido: { rotulo: "Válido", cor: "#16a34a" },
  vencendo: { rotulo: "Vencendo", cor: "#d97706" },
  vencido: { rotulo: "Vencido", cor: "#dc2626" },
  "sem-validade": { rotulo: "Sem validade", cor: "#64748b" },
};
