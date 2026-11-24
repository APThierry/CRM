"use server";
// Confirma o e-mail pelo link recebido e já entra no CRM (Fase F2).
// A confirmação é um botão (POST), não a simples abertura do link: alguns
// programas de e-mail "abrem" os links sozinhos para conferir se são seguros.
import { redirect } from "next/navigation";
import { usarCodigo } from "@/lib/conta";
import { db } from "@/lib/db";
import { motivoBloqueio } from "@/lib/empresas/situacao";
import { criarSessao } from "@/lib/sessao";

export async function confirmarEmail(codigo: string, _estado: { erro?: string } | null): Promise<{ erro?: string }> {
  const usuario = await usarCodigo(codigo, "CONFIRMAR_EMAIL");
  if (!usuario) return { erro: "Este link não vale mais (já foi usado ou passou de 48 horas). Tente entrar: enviamos um link novo." };
  if (!usuario.emailConfirmadoEm) await db.usuario.update({ where: { id: usuario.id }, data: { emailConfirmadoEm: new Date() } });
  const bloqueio = motivoBloqueio(usuario.organizacao);
  if (bloqueio) return { erro: `E-mail confirmado. ${bloqueio}` };
  await criarSessao(usuario.id);
  redirect("/primeiros-passos");
}
