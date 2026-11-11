import "server-only";
import { db } from "@/lib/db";

// Organização "logada".
// TODO (Fase 2 - login): pegar a organização do usuário autenticado.
// Por enquanto usamos a organização definida em ORG_SLUG (padrão: brigada-mg).
export async function getOrganizacaoAtual() {
  const slug = process.env.ORG_SLUG ?? "brigada-mg";
  const org = await db.organizacao.findUnique({ where: { slug } });
  if (!org) {
    throw new Error(`Organização "${slug}" não encontrada. Rode: npx prisma db seed`);
  }
  return org;
}
