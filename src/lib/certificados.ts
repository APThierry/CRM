import "server-only";
// Regras de certificado: validade e numeração.
import { db } from "@/lib/db";

/** Soma meses a uma data (ex.: 12 = um ano). */
export function somarMeses(data: Date, meses: number) {
  const d = new Date(data);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d;
}

/**
 * Validade do certificado: último dia da turma + validade do curso.
 * Sem validade cadastrada no curso, o certificado não vence (null).
 */
export function calcularValidade(turma: { dataInicio: Date; dataFim: Date | null }, validadeMeses: number | null) {
  if (!validadeMeses) return null;
  return somarMeses(turma.dataFim ?? turma.dataInicio, validadeMeses);
}

/** Prefixo a partir do slug da organização: "brigada-mg" -> "BM". */
function prefixo(slug: string) {
  return slug
    .split("-")
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

/** Próximo número de certificado da organização no ano: BM-2026-0001, BM-2026-0002… */
export async function proximoNumeroCertificado(org: { id: string; slug: string }) {
  const inicio = `${prefixo(org.slug)}-${new Date().getFullYear()}-`;
  const ultimo = await db.matricula.findFirst({
    where: { turma: { organizacaoId: org.id }, certificadoNumero: { startsWith: inicio } },
    orderBy: { certificadoNumero: "desc" },
    select: { certificadoNumero: true },
  });
  const sequencia = ultimo?.certificadoNumero ? Number(ultimo.certificadoNumero.slice(inicio.length)) + 1 : 1;
  return `${inicio}${String(sequencia).padStart(4, "0")}`;
}

export type SituacaoCertificado = "valido" | "vencendo" | "vencido" | "sem-validade";

/** Vencendo = vence nos próximos 60 dias (janela para oferecer reciclagem). */
export function situacaoCertificado(validadeAte: Date | null, hoje = new Date()): SituacaoCertificado {
  if (!validadeAte) return "sem-validade";
  if (validadeAte < hoje) return "vencido";
  if (validadeAte.getTime() - hoje.getTime() <= 60 * 24 * 60 * 60 * 1000) return "vencendo";
  return "valido";
}
