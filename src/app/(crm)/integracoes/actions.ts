"use server";
// Integrações: cadastro de webhooks de saída. Só o administrador.
import { refresh } from "next/cache";
import { exigirPapel } from "@/lib/auth";
import { db } from "@/lib/db";
import { entregar, novoSegredo } from "@/lib/webhooks/disparar";
import { ehEvento } from "@/lib/webhooks/eventos";

export type Resultado = { erro?: string; ok?: string } | null;

async function webhookDaOrganizacao(id: string) {
  const eu = await exigirPapel("ADMIN");
  const webhook = await db.webhook.findFirst({ where: { id, organizacaoId: eu.organizacao.id } });
  if (!webhook) throw new Error("Webhook não encontrado.");
  return { eu, webhook };
}

/** Só aceita endereços http(s). Avisa quando o endereço não tem HTTPS. */
function lerUrl(valor: string) {
  try {
    const url = new URL(valor);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null; // senha no endereço vazaria nos registros
    return url.toString();
  } catch {
    return null;
  }
}

export async function criarWebhook(_estado: Resultado, formData: FormData): Promise<Resultado> {
  const eu = await exigirPapel("ADMIN");
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 80);
  const url = lerUrl(String(formData.get("url") ?? "").trim());
  const eventos = formData.getAll("eventos").map(String).filter(ehEvento);
  if (!nome) return { erro: "Dê um nome (ex.: n8n, Planilha de vendas)." };
  if (!url) return { erro: "Endereço inválido. Use um endereço completo, começando com https://" };
  if (!eventos.length) return { erro: "Escolha pelo menos um evento." };
  const total = await db.webhook.count({ where: { organizacaoId: eu.organizacao.id } });
  if (total >= 20) return { erro: "Limite de 20 webhooks por empresa." };

  await db.webhook.create({ data: { organizacaoId: eu.organizacao.id, nome, url, eventos, segredo: novoSegredo() } });
  refresh();
  return { ok: url.startsWith("http:") ? "Webhook criado. Atenção: sem HTTPS, os dados viajam sem criptografia." : "Webhook criado." };
}

export async function salvarEventos(id: string, _estado: Resultado, formData: FormData): Promise<Resultado> {
  const { webhook } = await webhookDaOrganizacao(id);
  const eventos = formData.getAll("eventos").map(String).filter(ehEvento);
  const url = lerUrl(String(formData.get("url") ?? "").trim());
  if (!url) return { erro: "Endereço inválido." };
  if (!eventos.length) return { erro: "Escolha pelo menos um evento." };
  await db.webhook.update({ where: { id: webhook.id }, data: { eventos, url } });
  refresh();
  return { ok: "Salvo." };
}

export async function alternarWebhook(id: string) {
  const { webhook } = await webhookDaOrganizacao(id);
  await db.webhook.update({ where: { id: webhook.id }, data: { ativo: !webhook.ativo } });
  refresh();
}

export async function excluirWebhook(id: string) {
  const { webhook } = await webhookDaOrganizacao(id);
  await db.webhook.delete({ where: { id: webhook.id } });
  refresh();
}

export async function trocarSegredo(id: string) {
  const { webhook } = await webhookDaOrganizacao(id);
  await db.webhook.update({ where: { id: webhook.id }, data: { segredo: novoSegredo() } });
  refresh();
}

/** Manda um aviso de teste agora e mostra o que o outro sistema respondeu. */
export async function testarWebhook(id: string, _estado: Resultado): Promise<Resultado> {
  const { eu, webhook } = await webhookDaOrganizacao(id);
  const entrega = await db.entregaWebhook.create({
    data: {
      webhookId: webhook.id,
      evento: "teste",
      payload: { mensagem: "Teste do CRM", organizacao: eu.organizacao.nome, enviadoPor: eu.nome },
      status: "ENVIANDO",
      tentativas: 0,
    },
    include: { webhook: true },
  });
  // Teste: uma tentativa só (não fica tentando de novo).
  const ok = await entregar(entrega, new Date(), true);
  const depois = await db.entregaWebhook.findUnique({ where: { id: entrega.id } });
  refresh();
  return ok ? { ok: `Entregue (resposta ${depois?.respostaCodigo}).` } : { erro: `Não entregou: ${depois?.erro ?? "erro desconhecido"}` };
}

/** Coloca de novo na fila um aviso que esgotou as tentativas. */
export async function reenviarEntrega(entregaId: string) {
  const eu = await exigirPapel("ADMIN");
  await db.entregaWebhook.updateMany({
    where: { id: entregaId, status: "FALHOU", webhook: { organizacaoId: eu.organizacao.id } },
    data: { status: "PENDENTE", tentativas: 0, proximaEm: new Date(), erro: null },
  });
  refresh();
}
