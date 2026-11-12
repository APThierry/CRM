"use server";
// Ações do WhatsApp chamadas pelas telas.
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { normalizarWhatsapp } from "@/lib/formatar";
import { getUsuarioAtual } from "@/lib/auth";
import { getOrganizacaoAtual } from "@/lib/org";
import {
  desconectar,
  enviarTexto,
  ErroWhatsapp,
  estadoConexao,
  garantirInstancia,
  gerarQrCode,
  INSTANCIA,
} from "@/lib/whatsapp/evolution";
import { encontrarPorTelefone } from "@/lib/whatsapp/mensagens";

/** Grava qual instância pertence à organização (usado pelo webhook). */
async function registrarConfiguracao(organizacaoId: string, ativo: boolean) {
  await db.configuracaoWhatsapp.upsert({
    where: { organizacaoId },
    create: { organizacaoId, provedor: "EVOLUTION", instancia: INSTANCIA, apiUrl: process.env.EVOLUTION_API_URL, ativo },
    update: { instancia: INSTANCIA, apiUrl: process.env.EVOLUTION_API_URL, ativo },
  });
}

/** Consultado a cada poucos segundos pela tela de conexão. */
export async function statusWhatsapp() {
  return estadoConexao();
}

export async function iniciarConexao(): Promise<{ qr?: string | null; erro?: string }> {
  const org = await getOrganizacaoAtual();
  try {
    await registrarConfiguracao(org.id, true);
    return { qr: await gerarQrCode() };
  } catch (e) {
    return { erro: e instanceof ErroWhatsapp ? e.message : "Erro ao gerar o QR Code." };
  }
}

/** Reaplica o webhook (útil se o endereço do CRM mudar). */
export async function reconfigurar(): Promise<{ erro?: string }> {
  const org = await getOrganizacaoAtual();
  try {
    await registrarConfiguracao(org.id, true);
    await garantirInstancia();
    return {};
  } catch (e) {
    return { erro: e instanceof ErroWhatsapp ? e.message : "Erro ao configurar." };
  }
}

export async function desconectarWhatsapp() {
  const org = await getOrganizacaoAtual();
  await desconectar().catch(() => {});
  await registrarConfiguracao(org.id, false);
  refresh();
}

/** Envia uma mensagem para o cliente a partir da ficha dele. */
export async function enviarParaCliente(
  clienteId: string,
  _estado: { erro?: string; ok?: boolean } | null,
  formData: FormData,
): Promise<{ erro?: string; ok?: boolean }> {
  const eu = await getUsuarioAtual();
  const org = eu.organizacao;
  const cliente = await db.cliente.findFirst({
    where: { id: clienteId, organizacaoId: org.id },
    include: { contatos: { orderBy: { principal: "desc" } } },
  });
  if (!cliente) return { erro: "Cliente não encontrado." };

  const texto = String(formData.get("texto") ?? "").trim();
  if (!texto) return { erro: "Escreva a mensagem." };

  // Número escolhido no formulário, ou o WhatsApp do cliente, ou o do contato principal.
  const escolhido = String(formData.get("numero") ?? "");
  const numero = normalizarWhatsapp(escolhido || cliente.whatsapp || cliente.contatos.find((c) => c.whatsapp)?.whatsapp);
  if (!numero) return { erro: "Este cliente não tem número de WhatsApp cadastrado." };

  try {
    // Assinatura: o cliente vê "*Ana:*" (negrito no WhatsApp) antes do texto.
    const assinado = eu.assinaturaWhatsapp ? `*${eu.nome.split(" ")[0]}:*
${texto}` : texto;
    const { idExterno } = await enviarTexto(numero, assinado);
    const { contatoId } = await encontrarPorTelefone(org.id, numero);
    // A Evolution API também avisa o webhook sobre esta mensagem. Se o webhook
    // chegou primeiro, só atualizamos o registro em vez de duplicar.
    const jaSalva = idExterno ? await db.mensagemWhatsapp.findFirst({ where: { organizacaoId: org.id, idExterno } }) : null;
    const dados = { clienteId, contatoId, telefone: numero, direcao: "SAIDA" as const, conteudo: texto, status: "enviada", idExterno, usuarioId: eu.id };
    if (jaSalva) await db.mensagemWhatsapp.update({ where: { id: jaSalva.id }, data: dados });
    else await db.mensagemWhatsapp.create({ data: { ...dados, organizacaoId: org.id } });
    refresh();
    return { ok: true };
  } catch (e) {
    return { erro: e instanceof ErroWhatsapp ? e.message : "Não foi possível enviar." };
  }
}
