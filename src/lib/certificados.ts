import "server-only";
// Regras de certificado: validade e numeração.
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ESPERA_TRAVA, travar } from "@/lib/trava";

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

/**
 * Próximo número de certificado da organização no ano: BM-2026-0001, BM-2026-0002…
 * O maior é achado como NÚMERO (como texto, "9999" viria depois de "10000").
 */
async function proximoNumero(tx: Prisma.TransactionClient, org: { id: string; slug: string }) {
  const inicio = `${prefixo(org.slug)}-${new Date().getFullYear()}-`;
  const [{ maior }] = await tx.$queryRaw<{ maior: number }[]>`
    SELECT coalesce(max(substring(m."certificadoNumero" from ${inicio.length + 1}::int)::int), 0)::int AS maior
    FROM "Matricula" m JOIN "Turma" t ON t.id = m."turmaId"
    WHERE t."organizacaoId" = ${org.id}
      AND left(m."certificadoNumero", ${inicio.length}::int) = ${inicio}
      AND substring(m."certificadoNumero" from ${inicio.length + 1}::int) ~ '^[0-9]{1,9}$'`;
  return `${inicio}${String(maior + 1).padStart(4, "0")}`;
}

/**
 * Aprova a matrícula e emite o certificado. O número é dado uma vez só e nunca se
 * repete: as emissões da mesma empresa passam uma de cada vez (trava no banco).
 * Devolve true se o certificado saiu agora.
 */
export async function emitirCertificado(org: { id: string; slug: string }, matriculaId: string, dados: { validadeAte: Date | null; presente?: true }) {
  return db.$transaction(async (tx) => {
    await travar(tx, "certificado", org.id);
    const atual = await tx.matricula.findFirstOrThrow({
      where: { id: matriculaId, turma: { organizacaoId: org.id } },
      select: { certificadoNumero: true, emitidoEm: true },
    });
    await tx.matricula.update({
      where: { id: matriculaId },
      data: {
        ...dados,
        aprovado: true,
        certificadoNumero: atual.certificadoNumero ?? (await proximoNumero(tx, org)),
        emitidoEm: atual.emitidoEm ?? new Date(),
      },
    });
    return !atual.certificadoNumero;
  }, ESPERA_TRAVA);
}

export type SituacaoCertificado = "valido" | "vencendo" | "vencido" | "sem-validade";

/** Vencendo = vence nos próximos 60 dias (janela para oferecer reciclagem). */
export function situacaoCertificado(validadeAte: Date | null, hoje = new Date()): SituacaoCertificado {
  if (!validadeAte) return "sem-validade";
  if (validadeAte < hoje) return "vencido";
  if (validadeAte.getTime() - hoje.getTime() <= 60 * 24 * 60 * 60 * 1000) return "vencendo";
  return "valido";
}
