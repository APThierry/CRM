"use server";
// Gestão de usuários (só ADMIN) e perfil do próprio usuário.
import { refresh } from "next/cache";
import { exigirPapel, getUsuarioAtual } from "@/lib/auth";
import { db } from "@/lib/db";
import { conferirSenha, gerarHashSenha, validarSenhaNova } from "@/lib/senha";
import { encerrarSessoesDoUsuario } from "@/lib/sessao";
import type { Papel } from "@/generated/prisma/client";

export type Resultado = { erro?: string; ok?: string } | null;

const PAPEIS: Papel[] = ["ADMIN", "GESTOR", "VENDEDOR", "INSTRUTOR"];
const papelDe = (v: FormDataEntryValue | null) => PAPEIS.find((p) => p === v) ?? "VENDEDOR";

async function usuarioDaOrganizacao(usuarioId: string) {
  const admin = await exigirPapel("ADMIN");
  const usuario = await db.usuario.findFirst({ where: { id: usuarioId, organizacaoId: admin.organizacao.id } });
  if (!usuario) throw new Error("Usuário não encontrado.");
  return { admin, usuario };
}

/** Impede ficar sem nenhum administrador ativo. */
async function restariaAdmin(organizacaoId: string, usuarioId: string) {
  return (await db.usuario.count({ where: { organizacaoId, papel: "ADMIN", ativo: true, NOT: { id: usuarioId } } })) > 0;
}

export async function criarUsuario(_e: Resultado, formData: FormData): Promise<Resultado> {
  const admin = await exigirPapel("ADMIN");
  const nome = String(formData.get("nome") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  if (!nome || !email) return { erro: "Informe nome e e-mail." };
  const problema = validarSenhaNova(senha);
  if (problema) return { erro: problema };
  if (await db.usuario.findUnique({ where: { email } })) return { erro: "Já existe um usuário com este e-mail." };

  await db.usuario.create({
    data: {
      organizacaoId: admin.organizacao.id,
      nome,
      email,
      papel: papelDe(formData.get("papel")),
      senhaHash: await gerarHashSenha(senha),
    },
  });
  refresh();
  return { ok: `Usuário ${nome} criado. Passe o e-mail e a senha inicial para a pessoa.` };
}

export async function alterarPapel(usuarioId: string, formData: FormData) {
  const { admin, usuario } = await usuarioDaOrganizacao(usuarioId);
  const papel = papelDe(formData.get("papel"));
  if (usuario.papel === "ADMIN" && papel !== "ADMIN" && !(await restariaAdmin(admin.organizacao.id, usuarioId))) {
    throw new Error("É preciso ter pelo menos um administrador.");
  }
  await db.usuario.update({ where: { id: usuarioId }, data: { papel } });
  refresh();
}

export async function alternarAtivo(usuarioId: string) {
  const { admin, usuario } = await usuarioDaOrganizacao(usuarioId);
  if (usuario.ativo) {
    if (usuario.id === admin.id) throw new Error("Você não pode desativar a si mesmo.");
    if (usuario.papel === "ADMIN" && !(await restariaAdmin(admin.organizacao.id, usuarioId))) {
      throw new Error("É preciso ter pelo menos um administrador.");
    }
    await encerrarSessoesDoUsuario(usuarioId); // sai de todos os aparelhos na hora
  }
  await db.usuario.update({ where: { id: usuarioId }, data: { ativo: !usuario.ativo } });
  refresh();
}

export async function redefinirSenha(usuarioId: string, _e: Resultado, formData: FormData): Promise<Resultado> {
  const { usuario } = await usuarioDaOrganizacao(usuarioId);
  const senha = String(formData.get("senha") ?? "");
  const problema = validarSenhaNova(senha);
  if (problema) return { erro: problema };
  await db.usuario.update({ where: { id: usuarioId }, data: { senhaHash: await gerarHashSenha(senha) } });
  await encerrarSessoesDoUsuario(usuarioId);
  refresh();
  return { ok: `Senha de ${usuario.nome} redefinida.` };
}

// ---------------------------------------------------------------- perfil ---

export async function salvarPerfil(_e: Resultado, formData: FormData): Promise<Resultado> {
  const eu = await getUsuarioAtual();
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { erro: "Informe seu nome." };
  await db.usuario.update({
    where: { id: eu.id },
    data: { nome, assinaturaWhatsapp: formData.get("assinaturaWhatsapp") === "on" },
  });
  refresh();
  return { ok: "Perfil salvo." };
}

export async function trocarMinhaSenha(_e: Resultado, formData: FormData): Promise<Resultado> {
  const eu = await getUsuarioAtual();
  const atual = String(formData.get("atual") ?? "");
  const nova = String(formData.get("nova") ?? "");
  if (nova !== String(formData.get("confirmacao") ?? "")) return { erro: "As senhas novas não conferem." };
  const problema = validarSenhaNova(nova);
  if (problema) return { erro: problema };

  const registro = await db.usuario.findUniqueOrThrow({ where: { id: eu.id } });
  if (!(await conferirSenha(atual, registro.senhaHash))) return { erro: "A senha atual está incorreta." };

  await db.usuario.update({ where: { id: eu.id }, data: { senhaHash: await gerarHashSenha(nova) } });
  await encerrarSessoesDoUsuario(eu.id, true); // sai dos outros aparelhos, mantém este
  return { ok: "Senha alterada. Os outros aparelhos foram desconectados." };
}
