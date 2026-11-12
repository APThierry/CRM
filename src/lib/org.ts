import "server-only";
import { getUsuarioAtual } from "@/lib/auth";
import { db } from "@/lib/db";

/** Organização do usuário logado. Sem login, redireciona para /login. */
export async function getOrganizacaoAtual() {
  return (await getUsuarioAtual()).organizacao;
}

/**
 * Organização padrão, para lugares SEM usuário logado (ex.: o webhook do
 * WhatsApp quando a instância ainda não está registrada). Usa ORG_SLUG.
 */
export async function getOrganizacaoPadrao() {
  const slug = process.env.ORG_SLUG ?? "brigada-mg";
  const org = await db.organizacao.findUnique({ where: { slug } });
  if (!org) throw new Error(`Organização "${slug}" não encontrada. Rode: npx prisma db seed`);
  return org;
}
