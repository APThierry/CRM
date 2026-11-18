"use server";
// Entrar, sair e primeiro acesso.
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { motivoBloqueio } from "@/lib/empresas/situacao";
import { conferirSenha, gerarHashSenha, temSenha, validarSenhaNova } from "@/lib/senha";
import { criarSessao, encerrarSessao } from "@/lib/sessao";

// "valores" devolve o que a pessoa digitou (menos senhas): o React limpa o
// formulário depois do envio, e sem isso o e-mail sumiria a cada erro.
export type EstadoFormulario = { erro?: string; valores?: { nome?: string; email?: string } } | null;

// Proteção simples contra quem tenta adivinhar senhas: depois de 5 erros
// seguidos, o e-mail fica bloqueado por 15 minutos. (Fica na memória do
// servidor; reinicia junto com ele.)
const tentativas = new Map<string, { erros: number; ate: number }>();
const LIMITE = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;

const normalizarEmail = (v: FormDataEntryValue | null) => String(v ?? "").trim().toLowerCase();

export async function entrar(_estado: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const email = normalizarEmail(formData.get("email"));
  const senha = String(formData.get("senha") ?? "");
  const valores = { email };
  if (!email || !senha) return { erro: "Informe e-mail e senha.", valores };

  const registro = tentativas.get(email);
  if (registro && registro.erros >= LIMITE && registro.ate > Date.now()) {
    const minutos = Math.ceil((registro.ate - Date.now()) / 60000);
    return { erro: `Muitas tentativas. Tente de novo em ${minutos} min.`, valores };
  }

  const usuario = await db.usuario.findUnique({ where: { email }, include: { organizacao: { select: { situacao: true, testeAte: true } } } });
  const ok = usuario?.ativo && (await conferirSenha(senha, usuario.senhaHash));
  if (!usuario || !ok) {
    const erros = (registro && registro.ate > Date.now() ? registro.erros : 0) + 1;
    tentativas.set(email, { erros, ate: Date.now() + BLOQUEIO_MS });
    // Mesma mensagem para e-mail inexistente ou senha errada (não revela quem tem conta).
    return { erro: "E-mail ou senha incorretos.", valores };
  }

  tentativas.delete(email);
  // Empresa suspensa ou com o teste vencido (Fase F): a senha está certa, mas não entra.
  const bloqueio = motivoBloqueio(usuario.organizacao);
  if (bloqueio) return { erro: bloqueio, valores };
  await criarSessao(usuario.id);
  redirect("/");
}

export async function sair() {
  await encerrarSessao();
  redirect("/login");
}

/**
 * Instalação nova: existe UMA empresa só (a do seed) e ninguém no sistema tem
 * senha ainda. É o único caso em que o "primeiro acesso" cria um administrador
 * sem login. Empresas novas entram pelo cadastro (Fase F2) ou pelo script
 * scripts/criar-empresa.mts. Devolve a empresa, ou null se não estiver liberado.
 */
async function empresaDaInstalacaoNova() {
  const empresas = await db.organizacao.findMany({ take: 2 });
  if (empresas.length !== 1) return null;
  const usuarios = await db.usuario.findMany({ select: { senhaHash: true } });
  return usuarios.some((u) => temSenha(u.senhaHash)) ? null : empresas[0];
}

export async function primeiroAcessoLiberado() {
  return (await empresaDaInstalacaoNova()) !== null;
}

export async function configurarPrimeiroAcesso(_estado: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const org = await empresaDaInstalacaoNova();
  if (!org) return { erro: "O primeiro acesso já foi feito. Entre com seu e-mail e senha." };

  const nome = String(formData.get("nome") ?? "").trim();
  const email = normalizarEmail(formData.get("email"));
  const senha = String(formData.get("senha") ?? "");
  const valores = { nome, email };
  if (!nome || !email) return { erro: "Informe nome e e-mail.", valores };
  if (senha !== String(formData.get("confirmacao") ?? "")) return { erro: "As senhas não conferem.", valores };
  const problema = validarSenhaNova(senha);
  if (problema) return { erro: problema, valores };

  const existente = await db.usuario.findUnique({ where: { email } });
  if (existente && existente.organizacaoId !== org.id) return { erro: "Este e-mail já é usado em outra organização.", valores };

  const senhaHash = await gerarHashSenha(senha);
  const usuario = existente
    ? await db.usuario.update({ where: { id: existente.id }, data: { nome, senhaHash, papel: "ADMIN", ativo: true } })
    : await db.usuario.create({ data: { organizacaoId: org.id, nome, email, senhaHash, papel: "ADMIN" } });

  await criarSessao(usuario.id);
  redirect("/");
}
