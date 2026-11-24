"use server";
// Entrar, sair e primeiro acesso.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { motivoBloqueio } from "@/lib/empresas/situacao";
import { ipDaRequisicao } from "@/lib/limite";
import { aparelhoDaConta, avisoDeEspera, COOKIE_APARELHO, loginCerto, reservarAparelho, reservarLogin } from "@/lib/login-protecao";
import { conferirSetupToken, empresaDoPrimeiroAcesso } from "@/lib/primeiro-acesso";
import { conferirSenha, ErroOcupado, gerarHashSenha, SENHA_MAXIMA, validarSenhaNova } from "@/lib/senha";
import { criarSessao, encerrarSessao } from "@/lib/sessao";
import { ESPERA_TRAVA, travar } from "@/lib/trava";
import { EMAIL_MAXIMO, emailValido, normalizarEmail, umaLinha } from "@/lib/validar";

// "valores" devolve o que a pessoa digitou (menos senhas): o React limpa o
// formulário depois do envio, e sem isso o e-mail sumiria a cada erro.
export type EstadoFormulario = { erro?: string; valores?: { nome?: string; email?: string } } | null;

// A mesma frase para senha errada, conta que não existe, desativada ou sem confirmação:
// não revela quem tem conta.
const ERRO_LOGIN = 'E-mail ou senha incorretos. Se a conta é nova ou você não lembra a senha, use "Esqueci minha senha".';

export async function entrar(_estado: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const email = normalizarEmail(formData.get("email"));
  const senha = String(formData.get("senha") ?? "");
  const valores = { email: email.slice(0, EMAIL_MAXIMO) };
  if (!email || !senha) return { erro: "Informe e-mail e senha.", valores };
  if (email.length > EMAIL_MAXIMO || senha.length > SENHA_MAXIMA) return { erro: ERRO_LOGIN, valores };

  // A tentativa é contada ANTES de consultar o banco ou conferir a senha, sem await no
  // meio da conferência: cem pedidos ao mesmo tempo não passam todos.
  const ip = await ipDaRequisicao();
  let reserva = reservarLogin(ip, email);
  if (!reserva.ok) {
    // Limite cheio: só passa quem já entrou nesta conta neste aparelho (conta à parte).
    const cookie = (await cookies()).get(COOKIE_APARELHO)?.value;
    const conta = cookie ? await db.usuario.findUnique({ where: { email }, select: { id: true, senhaHash: true } }) : null;
    const aparelho = aparelhoDaConta(conta, cookie);
    if (aparelho) reserva = reservarAparelho(aparelho);
    if (!reserva.ok) return { erro: avisoDeEspera(reserva.esperaMs), valores };
  }

  const usuario = await db.usuario.findUnique({ where: { email }, include: { organizacao: { select: { situacao: true, testeAte: true } } } });
  let certa: boolean;
  try {
    // Sempre faz a conta da senha, mesmo se a conta não existe (hash falso).
    certa = await conferirSenha(senha, usuario?.senhaHash);
  } catch (e) {
    if (!(e instanceof ErroOcupado)) throw e;
    reserva.devolver();
    return { erro: e.message, valores };
  }
  if (!usuario || !certa || !usuario.ativo || !usuario.emailConfirmadoEm) return { erro: ERRO_LOGIN, valores };

  reserva.devolver(); // acertou: não conta como erro
  loginCerto(ip, email);
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

/** Cria o primeiro administrador. Regras de quando pode: src/lib/primeiro-acesso.ts. */
export async function configurarPrimeiroAcesso(_estado: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const nome = umaLinha(formData.get("nome"), 80);
  const email = normalizarEmail(formData.get("email"));
  const senha = String(formData.get("senha") ?? "");
  const valores = { nome, email };
  const fechado = { erro: "O primeiro acesso já foi feito ou está fechado. Entre com seu e-mail e senha.", valores };
  if (!(await empresaDoPrimeiroAcesso())) return fechado;
  const recusado = conferirSetupToken(String(formData.get("codigo") ?? ""), await ipDaRequisicao());
  if (recusado) return { erro: recusado, valores };

  if (!nome || !email) return { erro: "Informe nome e e-mail.", valores };
  if (!emailValido(email)) return { erro: "Confira o e-mail.", valores };
  if (senha !== String(formData.get("confirmacao") ?? "")) return { erro: "As senhas não conferem.", valores };
  const problema = validarSenhaNova(senha);
  if (problema) return { erro: problema, valores };

  const senhaHash = await gerarHashSenha(senha);
  // Com trava: dois envios ao mesmo tempo não criam dois administradores.
  const r = await db.$transaction(async (tx) => {
    await travar(tx, "primeiro-acesso", "");
    const org = await empresaDoPrimeiroAcesso(tx);
    if (!org) return fechado;
    const existente = await tx.usuario.findUnique({ where: { email } });
    if (existente && existente.organizacaoId !== org.id) {
      return { erro: "Este e-mail já é usado em outra empresa. Use outro, ou o script scripts/definir-acesso.mts.", valores };
    }
    const dados = { nome, senhaHash, papel: "ADMIN" as const, ativo: true, emailConfirmadoEm: new Date() };
    return existente
      ? tx.usuario.update({ where: { id: existente.id }, data: dados })
      : tx.usuario.create({ data: { ...dados, organizacaoId: org.id, email } });
  }, ESPERA_TRAVA);
  if ("erro" in r) return r;

  await criarSessao(r.id);
  redirect("/");
}
