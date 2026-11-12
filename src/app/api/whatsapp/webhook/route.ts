// Webhook: a Evolution API chama este endereço a cada mensagem do WhatsApp.
// POST /api/whatsapp/webhook
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { getOrganizacaoAtual } from "@/lib/org";
import { encontrarPorTelefone, textoDaMensagem, type ConteudoWhatsapp } from "@/lib/whatsapp/mensagens";

type MensagemRecebida = {
  key?: { id?: string; remoteJid?: string; remoteJidAlt?: string; fromMe?: boolean };
  pushName?: string;
  message?: ConteudoWhatsapp;
  messageTimestamp?: number | string;
};

/** Confere o segredo enviado no cabeçalho, para recusar chamadas de terceiros. */
function segredoValido(recebido: string | null) {
  const esperado = process.env.WHATSAPP_WEBHOOK_SEGREDO ?? "";
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!segredoValido(request.headers.get("x-crm-segredo"))) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }

  const corpo = (await request.json().catch(() => null)) as { event?: string; instance?: string; data?: unknown } | null;
  // Por enquanto só guardamos mensagens. O estado da conexão é consultado direto na tela do WhatsApp.
  if (!corpo || corpo.event !== "messages.upsert") return Response.json({ ok: true });

  // Descobre a organização pela instância. Se não houver configuração, usa a organização atual.
  const config = corpo.instance
    ? await db.configuracaoWhatsapp.findFirst({ where: { instancia: corpo.instance } })
    : null;
  const organizacaoId = config?.organizacaoId ?? (await getOrganizacaoAtual()).id;

  const mensagens = (Array.isArray(corpo.data) ? corpo.data : [corpo.data]) as MensagemRecebida[];
  let salvas = 0;

  for (const m of mensagens) {
    const jid = m.key?.remoteJid?.includes("@lid") ? m.key.remoteJidAlt : m.key?.remoteJid;
    // Ignora grupos, status e listas de transmissão.
    if (!jid || !jid.endsWith("@s.whatsapp.net")) continue;

    const conteudo = textoDaMensagem(m.message);
    if (!conteudo) continue;

    const idExterno = m.key?.id ?? null;
    if (idExterno && (await db.mensagemWhatsapp.findFirst({ where: { organizacaoId, idExterno } }))) continue; // já salva

    const telefone = jid.split("@")[0];
    const { clienteId, contatoId } = await encontrarPorTelefone(organizacaoId, telefone);
    const quando = Number(m.messageTimestamp);

    await db.mensagemWhatsapp.create({
      data: {
        organizacaoId,
        telefone,
        clienteId,
        contatoId,
        // fromMe = mensagem enviada pelo celular da empresa (fora do CRM)
        direcao: m.key?.fromMe ? "SAIDA" : "ENTRADA",
        conteudo,
        status: m.key?.fromMe ? "enviada pelo celular" : (m.pushName ?? null),
        idExterno,
        criadoEm: quando ? new Date(quando * 1000) : undefined,
      },
    });
    salvas++;
  }

  return Response.json({ ok: true, salvas });
}
