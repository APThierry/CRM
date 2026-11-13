import "server-only";
// Ligação entre mensagens do WhatsApp, conversas e clientes do CRM.
import type { DirecaoMensagem, TipoMensagem } from "@/generated/prisma/client";
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

// ---------------------------------------------------------------------------
// Conteúdo das mensagens que chegam da Evolution API
// ---------------------------------------------------------------------------

type Midia = { caption?: string; mimetype?: string; fileName?: string; seconds?: number };

export type ConteudoWhatsapp = {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: Midia;
  videoMessage?: Midia;
  documentMessage?: Midia;
  documentWithCaptionMessage?: { message?: { documentMessage?: Midia } };
  audioMessage?: Midia & { ptt?: boolean };
  stickerMessage?: Midia;
  locationMessage?: { degreesLatitude?: number; degreesLongitude?: number; name?: string };
  contactMessage?: { displayName?: string };
  reactionMessage?: object;
  protocolMessage?: object;
  /** Preenchido pela Evolution API quando o webhook está com base64 ligado. */
  base64?: string;
};

export type MensagemInterpretada = {
  tipo: TipoMensagem;
  conteudo: string;
  mimetype?: string;
  nomeArquivo?: string;
  base64?: string;
};

/** Descobre o tipo da mensagem, o texto a mostrar e a mídia (se houver). */
export function interpretarMensagem(m: ConteudoWhatsapp | undefined | null): MensagemInterpretada | null {
  if (!m || m.reactionMessage || m.protocolMessage) return null;
  const texto = m.conversation ?? m.extendedTextMessage?.text;
  if (texto) return { tipo: "TEXTO", conteudo: texto };

  const documento = m.documentMessage ?? m.documentWithCaptionMessage?.message?.documentMessage;
  const midia = (tipo: TipoMensagem, info: Midia, padrao: string): MensagemInterpretada => ({
    tipo,
    conteudo: info.caption || padrao,
    mimetype: info.mimetype,
    nomeArquivo: info.fileName,
    base64: m.base64,
  });

  if (m.imageMessage) return midia("IMAGEM", m.imageMessage, "📷 Imagem");
  if (m.videoMessage) return midia("VIDEO", m.videoMessage, "🎥 Vídeo");
  if (m.audioMessage) return midia("AUDIO", m.audioMessage, "🎤 Áudio");
  if (documento) return midia("DOCUMENTO", documento, `📎 ${documento.fileName ?? "Documento"}`);
  if (m.stickerMessage) return midia("FIGURINHA", m.stickerMessage, "Figurinha");
  if (m.locationMessage) {
    const { degreesLatitude: lat, degreesLongitude: lon, name } = m.locationMessage;
    const link = lat && lon ? ` https://maps.google.com/?q=${lat},${lon}` : "";
    return { tipo: "OUTRO", conteudo: `📍 ${name ?? "Localização"}${link}` };
  }
  if (m.contactMessage) return { tipo: "OUTRO", conteudo: `👤 Contato: ${m.contactMessage.displayName ?? ""}` };
  return null;
}

// ---------------------------------------------------------------------------
// Conversas
// ---------------------------------------------------------------------------

/** Devolve a conversa daquele número (cria se for a primeira mensagem). */
export async function obterConversa(organizacaoId: string, telefone: string, nome?: string | null) {
  const chave = chaveTelefone(telefone);
  if (!chave) throw new Error(`Telefone inválido: ${telefone}`);
  const existente = await db.conversa.findUnique({ where: { organizacaoId_chave: { organizacaoId, chave } } });
  if (existente) {
    // Atualiza o nome do perfil quando ele aparece (ou muda).
    if (nome && nome !== existente.nome) return db.conversa.update({ where: { id: existente.id }, data: { nome } });
    return existente;
  }
  const { clienteId, contatoId } = await encontrarPorTelefone(organizacaoId, telefone);
  return db.conversa.upsert({
    where: { organizacaoId_chave: { organizacaoId, chave } },
    create: { organizacaoId, telefone, chave, nome: nome ?? null, clienteId, contatoId },
    update: {},
  });
}

type NovaMensagem = {
  organizacaoId: string;
  telefone: string;
  direcao: DirecaoMensagem;
  tipo?: TipoMensagem;
  conteudo: string;
  arquivo?: string | null;
  mimetype?: string | null;
  nomeArquivo?: string | null;
  status?: string | null;
  idExterno?: string | null;
  usuarioId?: string | null;
  criadoEm?: Date;
  /** Nome do perfil no WhatsApp (só nas mensagens recebidas). */
  nomePerfil?: string | null;
  /** Mensagem recebida do cliente: conta como não lida e reabre a conversa. */
  doCliente?: boolean;
};

/** Grava a mensagem na conversa certa e atualiza o resumo da conversa. */
export async function registrarMensagem(dados: NovaMensagem) {
  const { organizacaoId, nomePerfil, doCliente, ...mensagem } = dados;
  if (mensagem.idExterno) {
    const ja = await db.mensagemWhatsapp.findFirst({ where: { organizacaoId, idExterno: mensagem.idExterno } });
    if (ja) return { mensagem: ja, nova: false };
  }
  const conversa = await obterConversa(organizacaoId, mensagem.telefone, nomePerfil);
  const quando = mensagem.criadoEm ?? new Date();

  const [criada] = await db.$transaction([
    db.mensagemWhatsapp.create({
      data: {
        ...mensagem,
        organizacaoId,
        conversaId: conversa.id,
        clienteId: conversa.clienteId,
        contatoId: conversa.contatoId,
        criadoEm: quando,
      },
    }),
    db.conversa.update({
      where: { id: conversa.id },
      data: {
        ultimaEm: quando > conversa.ultimaEm ? quando : conversa.ultimaEm,
        ultimaTexto: mensagem.conteudo.slice(0, 200),
        ultimaDirecao: mensagem.direcao,
        ...(doCliente ? { naoLidas: { increment: 1 }, status: "ABERTA" as const } : {}),
      },
    }),
  ]);
  return { mensagem: criada, nova: true, conversa };
}
