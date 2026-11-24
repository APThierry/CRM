import "server-only";
// Sessões de login guardadas no banco.
//
// O navegador recebe um código aleatório num cookie "httpOnly" (o JavaScript
// da página não consegue ler). No banco fica só o SHA-256 desse código.
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { empresaLiberada } from "@/lib/empresas/situacao";
import { COOKIE_APARELHO, DIAS_APARELHO, novoAparelho } from "@/lib/login-protecao";
import { temSenha } from "@/lib/senha";

export const COOKIE_SESSAO = "crm_sessao";
const DURACAO_DIAS = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function criarSessao(usuarioId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + DURACAO_DIAS * 24 * 60 * 60 * 1000);
  const navegador = (await headers()).get("user-agent")?.slice(0, 200) ?? null;

  await db.sessao.create({ data: { usuarioId, tokenHash: hashToken(token), expiraEm, navegador } });
  const usuario = await db.usuario.update({ where: { id: usuarioId }, data: { ultimoAcesso: new Date() } });

  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiraEm,
  });
  await marcarAparelho(usuario);
}

/**
 * Lembra que a conta já entrou neste aparelho: se alguém tentar adivinhar a senha de
 * longe, o bloqueio do login não atinge o dono (src/lib/login-protecao.ts). Não dá acesso.
 */
export async function marcarAparelho(usuario: { id: string; senhaHash: string }) {
  if (!temSenha(usuario.senhaHash)) return;
  (await cookies()).set(COOKIE_APARELHO, novoAparelho(usuario), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/login",
    maxAge: DIAS_APARELHO * 86_400,
  });
}

export async function encerrarSessao() {
  const loja = await cookies();
  const token = loja.get(COOKIE_SESSAO)?.value;
  if (token) await db.sessao.deleteMany({ where: { tokenHash: hashToken(token) } });
  loja.delete(COOKIE_SESSAO);
}

/** Encerra todas as sessões de um usuário (ex.: ao trocar a senha ou desativar). */
export async function encerrarSessoesDoUsuario(usuarioId: string, excetoAtual = false) {
  const token = excetoAtual ? (await cookies()).get(COOKIE_SESSAO)?.value : undefined;
  await db.sessao.deleteMany({
    where: { usuarioId, ...(token && { NOT: { tokenHash: hashToken(token) } }) },
  });
}

/**
 * Lê a sessão atual. `cache` do React faz a consulta uma vez só por requisição,
 * mesmo que várias partes da página perguntem quem está logado.
 */
export const lerSessao = cache(async () => {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!token) return null;

  const sessao = await db.sessao.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { usuario: { include: { organizacao: true } } },
  });
  if (!sessao || sessao.expiraEm < new Date() || !sessao.usuario.ativo || !sessao.usuario.emailConfirmadoEm) return null;
  // Empresa suspensa ou com o teste vencido: a sessão deixa de valer na hora.
  if (!empresaLiberada(sessao.usuario.organizacao)) return null;
  return sessao;
});
