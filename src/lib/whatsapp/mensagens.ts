import "server-only";
// Ligação entre mensagens do WhatsApp e os clientes do CRM.
import { db } from "@/lib/db";
import { chaveTelefone } from "@/lib/formatar";

/**
 * Procura o cliente (ou contato de um cliente) dono do telefone.
 * Compara pela chave DDD + 8 últimos dígitos para não errar por causa do nono dígito.
 */
export async function encontrarPorTelefone(organizacaoId: string, telefone: string) {
  const chave = chaveTelefone(telefone);
  if (!chave) return { clienteId: null, contatoId: null };
  const final = chave.slice(-8);

  // Primeiro filtramos no banco pelos 8 últimos dígitos e depois conferimos o DDD.
  const [contatos, clientes] = await Promise.all([
    db.contato.findMany({
      where: { organizacaoId, OR: [{ whatsapp: { endsWith: final } }, { telefone: { contains: final.slice(-4) } }] },
      select: { id: true, clienteId: true, whatsapp: true, telefone: true },
    }),
    db.cliente.findMany({
      where: { organizacaoId, OR: [{ whatsapp: { endsWith: final } }, { telefone: { contains: final.slice(-4) } }] },
      select: { id: true, whatsapp: true, telefone: true },
    }),
  ]);
  const confere = (t: string | null) => chaveTelefone(t) === chave;

  const contato = contatos.find((c) => confere(c.whatsapp) || confere(c.telefone));
  if (contato) return { clienteId: contato.clienteId, contatoId: contato.id };
  const cliente = clientes.find((c) => confere(c.whatsapp) || confere(c.telefone));
  return { clienteId: cliente?.id ?? null, contatoId: null };
}

/** Extrai o texto de uma mensagem do WhatsApp (texto simples, legenda de mídia etc.). */
export type ConteudoWhatsapp = {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string };
  videoMessage?: { caption?: string };
  documentMessage?: { caption?: string; fileName?: string };
  audioMessage?: object;
  stickerMessage?: object;
  locationMessage?: object;
  contactMessage?: { displayName?: string };
};

export function textoDaMensagem(m: ConteudoWhatsapp | undefined | null): string | null {
  if (!m) return null;
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    (m.imageMessage && "📷 Imagem") ??
    (m.videoMessage && "🎥 Vídeo") ??
    (m.audioMessage && "🎤 Áudio") ??
    (m.documentMessage && `📎 ${m.documentMessage.fileName ?? "Documento"}`) ??
    (m.stickerMessage && "Figurinha") ??
    (m.locationMessage && "📍 Localização") ??
    (m.contactMessage && `👤 Contato: ${m.contactMessage.displayName ?? ""}`) ??
    null
  );
}
