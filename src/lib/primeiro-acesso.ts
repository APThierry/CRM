import "server-only";
// Primeiro acesso: criar o administrador de uma instalação nova, sem login.
//
// - No seu computador (desenvolvimento): aparece quando existe UMA empresa só (a do
//   seed) e ninguém no sistema tem senha.
// - Em produção: só com o SETUP_TOKEN do .env (sem ele, fica fechado). Conta apenas
//   as empresas que NÃO vieram da página "Criar conta", então alguém se cadastrar
//   antes não atrapalha.
//
// Outro caminho, que funciona sempre: scripts/definir-acesso.mts, que mostra no
// terminal um link para a pessoa definir a própria senha.
import { createHash, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { emProducao, setupToken } from "@/lib/ambiente";
import { db } from "@/lib/db";
import { regraPorIp, reservar } from "@/lib/limite";
import { temSenha } from "@/lib/senha";

type Banco = typeof db | Prisma.TransactionClient;

/** A empresa que espera o primeiro administrador, ou null se não estiver liberado. */
export async function empresaDoPrimeiroAcesso(banco: Banco = db) {
  const producao = emProducao();
  if (producao && !setupToken()) return null;
  const empresas = await banco.organizacao.findMany({ where: producao ? { termosAceitosEm: null } : {}, take: 2 });
  if (empresas.length !== 1) return null;
  const usuarios = await banco.usuario.findMany({ where: producao ? { organizacaoId: empresas[0].id } : {}, select: { senhaHash: true } });
  return usuarios.some((u) => temSenha(u.senhaHash)) ? null : empresas[0];
}

/** Para a tela de entrada: mostrar o formulário? Pede o código? */
export async function primeiroAcesso() {
  return (await empresaDoPrimeiroAcesso()) ? { exigeCodigo: emProducao() } : null;
}

const resumo = (t: string) => createHash("sha256").update(t).digest();

/**
 * Confere o código em tempo constante, com limite de tentativas. No desenvolvimento
 * não pede código. Devolve o erro, ou null se pode continuar.
 */
export function conferirSetupToken(recebido: string, ip: string | null) {
  if (!emProducao()) return null;
  const esperado = setupToken();
  if (!esperado) return "O primeiro acesso está fechado.";
  const vaga = reservar(regraPorIp("setup", ip, 5, 15 * 60_000, 20));
  if (!vaga.ok) return `Muitas tentativas. Tente de novo em ${Math.ceil(vaga.esperaMs / 60_000)} min.`;
  if (!timingSafeEqual(resumo(recebido.trim()), resumo(esperado))) return "Código de instalação incorreto.";
  vaga.devolver();
  return null;
}
