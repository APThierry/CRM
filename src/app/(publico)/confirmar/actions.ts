"use server";
// Conclui o cadastro pelo link recebido: a pessoa escolhe a senha, a empresa é criada
// e ela já entra no CRM (Fase F2). É um formulário (POST), não a simples abertura do
// link: alguns programas de e-mail "abrem" os links sozinhos para conferir se são seguros.
import { redirect } from "next/navigation";
import { after } from "next/server";
import { cadastroAberto } from "@/lib/cadastro";
import { avisarDonoDoCadastro, concluirCadastro, falhaDeEmail } from "@/lib/conta";
import { ErroCadastro } from "@/lib/empresas/criar";
import { ipDaRequisicao, regraPorIp, reservar } from "@/lib/limite";
import { ErroOcupado, validarSenhaNova } from "@/lib/senha";
import { criarSessao } from "@/lib/sessao";
import type { EstadoSenha } from "../senha/actions";

export async function confirmarCadastro(codigo: string, _estado: EstadoSenha, formData: FormData): Promise<EstadoSenha> {
  if (!cadastroAberto()) return { erro: "O cadastro de novas empresas está fechado no momento." };
  const senha = String(formData.get("senha") ?? "");
  if (senha !== String(formData.get("confirmacao") ?? "")) return { erro: "As senhas não conferem." };
  const problema = validarSenhaNova(senha);
  if (problema) return { erro: problema };
  if (!reservar(regraPorIp("link", await ipDaRequisicao(), 20, 15 * 60_000)).ok) return { erro: "Muitas tentativas. Espere alguns minutos." };

  let usuarioId: string;
  try {
    const r = await concluirCadastro(codigo, senha);
    if (!r) return { erro: "Este link não vale mais (já foi usado ou passou de 48 horas). Faça o cadastro de novo." };
    const { org, admin, telefone } = r;
    usuarioId = admin.id;
    console.log(`[cadastro] nova empresa: ${org.slug}`);
    after(() => avisarDonoDoCadastro(org, admin, telefone).catch(falhaDeEmail("cadastro")));
  } catch (e) {
    if (e instanceof ErroCadastro || e instanceof ErroOcupado) return { erro: e.message };
    console.error("[cadastro] não consegui concluir:", e);
    return { erro: "Não foi possível criar a conta agora. Tente de novo em alguns minutos." };
  }
  await criarSessao(usuarioId);
  redirect("/primeiros-passos");
}
