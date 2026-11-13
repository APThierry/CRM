import "server-only";
// Regras de acesso da Central de atendimento.
//
// - Administrador e gestor veem todas as conversas e podem transferir qualquer uma.
// - Vendedor/atendente e instrutor veem a FILA (conversas sem atendente) e as
//   conversas que são deles. Ao responder uma conversa da fila, ela passa a ser dele.
import type { Papel, Prisma } from "@/generated/prisma/client";
import type { UsuarioAtual } from "@/lib/auth";
import { db } from "@/lib/db";

export const veTodasConversas = (papel: Papel) => papel === "ADMIN" || papel === "GESTOR";

/** Filtro do Prisma com as conversas que a pessoa pode ver. */
export function conversasVisiveis(eu: UsuarioAtual): Prisma.ConversaWhereInput {
  const base = { organizacaoId: eu.organizacao.id };
  if (veTodasConversas(eu.papel)) return base;
  return { ...base, OR: [{ atendenteId: null }, { atendenteId: eu.id }] };
}

/** Busca uma conversa que a pessoa pode ver (ou null). */
export function buscarConversa(eu: UsuarioAtual, id: string) {
  return db.conversa.findFirst({ where: { AND: [{ id }, conversasVisiveis(eu)] } });
}

/** Troca {nome}, {primeiro_nome} e {atendente} nas respostas rápidas. */
export function preencherVariaveis(texto: string, valores: { nome?: string | null; atendente: string }) {
  const nome = (valores.nome ?? "").trim();
  return texto
    .replaceAll("{nome}", nome)
    .replaceAll("{primeiro_nome}", nome.split(" ")[0] ?? "")
    .replaceAll("{atendente}", valores.atendente.split(" ")[0]);
}
