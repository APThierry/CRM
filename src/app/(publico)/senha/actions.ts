"use server";
// "Esqueci minha senha" (Fase F2): manda um link por e-mail e cria a senha nova.
import { redirect } from "next/navigation";
import { enviarNovaSenha, usarCodigo } from "@/lib/conta";
import { db } from "@/lib/db";
import { motivoBloqueio } from "@/lib/empresas/situacao";
import { dentroDoLimite, ipDaRequisicao } from "@/lib/limite";
import { gerarHashSenha, validarSenhaNova } from "@/lib/senha";
import { criarSessao, encerrarSessoesDoUsuario } from "@/lib/sessao";

export type EstadoSenha = { erro?: string; ok?: string; email?: string } | null;

/** A resposta é sempre a mesma, exista ou não a conta (não revela quem tem cadastro). */
export async function pedirNovaSenha(_estado: EstadoSenha, formData: FormData): Promise<EstadoSenha> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 120);
  if (!email) return { erro: "Informe o seu e-mail." };
  const resposta = { ok: `Se existir uma conta com ${email}, enviamos um link para criar a senha nova. Ele vale por 1 hora.` };

  const ip = await ipDaRequisicao();
  if (!dentroDoLimite(`senha-ip:${ip}`, 10, 3600_000)) return { erro: "Muitos pedidos deste endereço. Tente de novo daqui a uma hora.", email };
  // Um e-mail a cada 5 minutos por conta, para ninguém lotar a caixa de outra pessoa.
  if (!dentroDoLimite(`senha:${email}`, 1, 5 * 60_000)) return resposta;

  const usuario = await db.usuario.findUnique({ where: { email } });
  if (usuario?.ativo) await enviarNovaSenha(usuario).catch((e) => console.error("[senha] não consegui enviar o e-mail:", e));
  return resposta;
}

export async function definirNovaSenha(codigo: string, _estado: EstadoSenha, formData: FormData): Promise<EstadoSenha> {
  const senha = String(formData.get("senha") ?? "");
  if (senha !== String(formData.get("confirmacao") ?? "")) return { erro: "As senhas não conferem." };
  const problema = validarSenhaNova(senha);
  if (problema) return { erro: problema };

  const usuario = await usarCodigo(codigo, "NOVA_SENHA");
  if (!usuario) return { erro: "Este link não vale mais (já foi usado ou passou de 1 hora). Peça outro." };
  await db.usuario.update({
    where: { id: usuario.id },
    // Quem recebeu o link no e-mail provou que o e-mail é seu: vale como confirmação.
    data: { senhaHash: await gerarHashSenha(senha), emailConfirmadoEm: usuario.emailConfirmadoEm ?? new Date() },
  });
  // Senha trocada: quem estava logado com a senha antiga (em qualquer aparelho) sai.
  await encerrarSessoesDoUsuario(usuario.id);
  const bloqueio = motivoBloqueio(usuario.organizacao);
  if (bloqueio) return { ok: `Senha trocada. ${bloqueio}` };
  await criarSessao(usuario.id);
  redirect("/");
}
