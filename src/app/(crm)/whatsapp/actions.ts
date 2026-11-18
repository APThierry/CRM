"use server";
// Ações do WhatsApp chamadas pelas telas.
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { normalizarWhatsapp } from "@/lib/formatar";
import { getUsuarioAtual } from "@/lib/auth";
import { getOrganizacaoAtual } from "@/lib/org";
import { buscarConversa } from "@/lib/atendimento";
import { enviarNaConversa } from "@/lib/whatsapp/enviar";
import {
  desconectar,
  ErroWhatsapp,
  estadoConexao,
  garantirInstancia,
  gerarQrCode,
} from "@/lib/whatsapp/evolution";
import { instanciaDaEmpresa } from "@/lib/whatsapp/instancia";
import { obterConversa } from "@/lib/whatsapp/mensagens";

/**
 * Marca o WhatsApp da organização como ligado ou desligado e devolve o nome da
 * instância dela (cada empresa tem a sua: src/lib/whatsapp/instancia.ts).
 */
async function registrarConfiguracao(organizacaoId: string, ativo: boolean) {
  const instancia = await instanciaDaEmpresa(organizacaoId);
  await db.configuracaoWhatsapp.update({ where: { organizacaoId }, data: { apiUrl: process.env.EVOLUTION_API_URL, ativo } });
  return instancia;
}

/** Consultado a cada poucos segundos pela tela de conexão. */
export async function statusWhatsapp() {
  const org = await getOrganizacaoAtual();
  return estadoConexao(await instanciaDaEmpresa(org.id));
}

export async function iniciarConexao(): Promise<{ qr?: string | null; erro?: string }> {
  const org = await getOrganizacaoAtual();
  try {
    const instancia = await registrarConfiguracao(org.id, true);
    return { qr: await gerarQrCode(instancia) };
  } catch (e) {
    return { erro: e instanceof ErroWhatsapp ? e.message : "Erro ao gerar o QR Code." };
  }
}

/** Reaplica o webhook (útil se o endereço do CRM mudar). */
export async function reconfigurar(): Promise<{ erro?: string }> {
  const org = await getOrganizacaoAtual();
  try {
    await garantirInstancia(await registrarConfiguracao(org.id, true));
    return {};
  } catch (e) {
    return { erro: e instanceof ErroWhatsapp ? e.message : "Erro ao configurar." };
  }
}

export async function desconectarWhatsapp() {
  const org = await getOrganizacaoAtual();
  const instancia = await registrarConfiguracao(org.id, false);
  await desconectar(instancia).catch(() => {});
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

  // Número escolhido no formulário, ou o WhatsApp do cliente, ou o do contato principal.
  const escolhido = String(formData.get("numero") ?? "");
  const numero = normalizarWhatsapp(escolhido || cliente.whatsapp || cliente.contatos.find((c) => c.whatsapp)?.whatsapp);
  if (!numero) return { erro: "Este cliente não tem número de WhatsApp cadastrado." };

  // A mensagem entra na conversa daquele número, a mesma da Central de atendimento.
  const conversa = await obterConversa(org.id, numero);
  if (!(await buscarConversa(eu, conversa.id))) return { erro: "A conversa com este número está com outro atendente." };
  if (!conversa.clienteId) {
    await db.$transaction([
      db.conversa.update({ where: { id: conversa.id }, data: { clienteId } }),
      db.mensagemWhatsapp.updateMany({ where: { conversaId: conversa.id }, data: { clienteId } }),
    ]);
  }
  const resultado = await enviarNaConversa(eu, conversa, { texto: String(formData.get("texto") ?? "") });
  if (resultado.ok) refresh();
  return resultado;
}
