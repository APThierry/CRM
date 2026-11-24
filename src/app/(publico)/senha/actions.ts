"use server";
// "Esqueci minha senha" (Fase F2): manda um link por e-mail e cria a senha nova.
import { redirect } from "next/navigation";
import { after } from "next/server";
import { falhaDeEmail, processarPedidoDeSenha, trocarSenhaPeloLink } from "@/lib/conta";
import { motivoBloqueio } from "@/lib/empresas/situacao";
import { dentroDoLimite, ipDaRequisicao, regraPorIp, reservar } from "@/lib/limite";
import { ErroOcupado, validarSenhaNova } from "@/lib/senha";
import { criarSessao } from "@/lib/sessao";
import { emailValido, normalizarEmail } from "@/lib/validar";

export type EstadoSenha = { erro?: string; ok?: string; email?: string } | null;

/**
 * A resposta é sempre a mesma, exista ou não a conta (não revela quem tem cadastro).
 * A consulta e o envio acontecem depois da resposta: o tempo também não revela.
 */
export async function pedirNovaSenha(_estado: EstadoSenha, formData: FormData): Promise<EstadoSenha> {
  const email = normalizarEmail(formData.get("email"));
  if (!emailValido(email)) return { erro: "Confira o e-mail.", email };
  const resposta = { ok: `Se existir uma conta com ${email}, enviamos um link para criar a senha nova. Ele vale por 1 hora.` };

  const ip = await ipDaRequisicao();
  if (!reservar(regraPorIp("senha", ip, 10, 3600_000)).ok) return { erro: "Muitos pedidos deste endereço. Tente de novo daqui a uma hora.", email };
  // Um e-mail a cada 5 minutos e 5 por hora por conta, para ninguém lotar a caixa de
  // outra pessoa. Quando o limite acaba, o último link enviado continua valendo.
  if (dentroDoLimite(`senha:${email}`, 1, 5 * 60_000) && dentroDoLimite(`senha-hora:${email}`, 5, 3600_000)) {
    after(() => processarPedidoDeSenha(email).catch(falhaDeEmail("senha")));
  }
  return resposta;
}

export async function definirNovaSenha(codigo: string, _estado: EstadoSenha, formData: FormData): Promise<EstadoSenha> {
  const senha = String(formData.get("senha") ?? "");
  if (senha !== String(formData.get("confirmacao") ?? "")) return { erro: "As senhas não conferem." };
  const problema = validarSenhaNova(senha);
  if (problema) return { erro: problema };
  if (!reservar(regraPorIp("link", await ipDaRequisicao(), 20, 15 * 60_000)).ok) return { erro: "Muitas tentativas. Espere alguns minutos." };

  // Gasta o link, troca a senha, invalida os outros links e desconecta todos os aparelhos.
  let usuario;
  try {
    usuario = await trocarSenhaPeloLink(codigo, senha);
  } catch (e) {
    if (e instanceof ErroOcupado) return { erro: e.message };
    throw e;
  }
  if (!usuario) return { erro: "Este link não vale mais (já foi usado ou venceu). Peça outro." };
  const bloqueio = motivoBloqueio(usuario.organizacao);
  if (bloqueio) return { ok: `Senha trocada. ${bloqueio}` };
  await criarSessao(usuario.id);
  redirect("/");
}
