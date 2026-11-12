import "server-only";
// Camada de acesso: quem está logado e o que pode fazer.
// Toda página e Server Action passa por aqui (via getOrganizacaoAtual ou
// getUsuarioAtual), então nenhuma gravação acontece sem login.
import { redirect } from "next/navigation";
import type { Papel } from "@/generated/prisma/client";
import { lerSessao } from "@/lib/sessao";

export type UsuarioAtual = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  assinaturaWhatsapp: boolean;
  organizacao: { id: string; nome: string; slug: string };
};

/** Usuário logado. Sem login, manda para a tela de entrada. */
export async function getUsuarioAtual(): Promise<UsuarioAtual> {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");
  const { usuario } = sessao;
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    assinaturaWhatsapp: usuario.assinaturaWhatsapp,
    organizacao: { id: usuario.organizacao.id, nome: usuario.organizacao.nome, slug: usuario.organizacao.slug },
  };
}

export const nomesPapel: Record<Papel, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  VENDEDOR: "Vendedor / Atendente",
  INSTRUTOR: "Instrutor",
};

/** Exige um dos papéis. Use no começo de páginas e Server Actions restritas. */
export async function exigirPapel(...papeis: Papel[]) {
  const usuario = await getUsuarioAtual();
  if (!papeis.includes(usuario.papel)) redirect("/?sem-permissao=1");
  return usuario;
}

export const podeGerenciarUsuarios = (papel: Papel) => papel === "ADMIN";
