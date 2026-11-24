"use server";
// Aceita o convite de uma empresa: a pessoa escolhe a própria senha e já entra.
import { redirect } from "next/navigation";
import { aceitarConvite, conferirConvite } from "@/lib/conta";
import { ErroCadastro } from "@/lib/empresas/criar";
import { motivoBloqueio } from "@/lib/empresas/situacao";
import { ipDaRequisicao, regraPorIp, reservar } from "@/lib/limite";
import { ErroOcupado, validarSenhaNova } from "@/lib/senha";
import { criarSessao } from "@/lib/sessao";
import type { EstadoSenha } from "../senha/actions";

export async function entrarComConvite(codigo: string, _estado: EstadoSenha, formData: FormData): Promise<EstadoSenha> {
  const senha = String(formData.get("senha") ?? "");
  if (senha !== String(formData.get("confirmacao") ?? "")) return { erro: "As senhas não conferem." };
  const problema = validarSenhaNova(senha);
  if (problema) return { erro: problema };
  if (!reservar(regraPorIp("link", await ipDaRequisicao(), 20, 15 * 60_000)).ok) return { erro: "Muitas tentativas. Espere alguns minutos." };

  // Empresa suspensa: não gasta o convite.
  const convite = await conferirConvite(codigo);
  const bloqueio = convite && motivoBloqueio(convite.organizacao);
  if (bloqueio) return { erro: bloqueio };

  let usuarioId: string;
  try {
    const usuario = await aceitarConvite(codigo, senha);
    if (!usuario) return { erro: "Este convite não vale mais (já foi usado, cancelado ou venceu). Peça outro a quem convidou você." };
    usuarioId = usuario.id;
  } catch (e) {
    if (e instanceof ErroCadastro || e instanceof ErroOcupado) return { erro: e.message };
    console.error("[convite] não consegui aceitar:", e);
    return { erro: "Não foi possível aceitar o convite agora. Tente de novo em alguns minutos." };
  }
  await criarSessao(usuarioId);
  redirect("/");
}
