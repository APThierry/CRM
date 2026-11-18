import "server-only";
import { getUsuarioAtual } from "@/lib/auth";

/** Organização do usuário logado. Sem login, redireciona para /login. */
export async function getOrganizacaoAtual() {
  return (await getUsuarioAtual()).organizacao;
}
