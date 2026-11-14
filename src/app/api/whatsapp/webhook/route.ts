// Webhook: a Evolution API chama este endereço a cada mensagem do WhatsApp.
// POST /api/whatsapp/webhook
//
// Com o webhook em modo "base64", fotos, áudios, vídeos e documentos chegam
// junto com a mensagem. Gravamos o arquivo (src/lib/arquivos.ts) e a mensagem
// entra na conversa daquele número (src/lib/whatsapp/mensagens.ts).
// Depois de responder à Evolution API, roda a automação (chatbot, aviso de fora
// do horário, cancelamento de follow-ups, SAIR das campanhas): src/lib/automacao/ao-receber.ts.
// Avisos de entregue/lida (messages.update) atualizam as campanhas: src/lib/campanhas/status.ts.
import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { aoReceberDoCliente } from "@/lib/automacao/ao-receber";
import { registrarStatus } from "@/lib/campanhas/status";
import { salvarArquivo } from "@/lib/arquivos";
import { db } from "@/lib/db";
import { getOrganizacaoPadrao } from "@/lib/org";
import { dispararEvento } from "@/lib/webhooks/disparar";
import { interpretarMensagem, registrarMensagem, type ConteudoWhatsapp } from "@/lib/whatsapp/mensagens";

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
  // Avisos de "entregue" e "lida": só interessam às campanhas (status de cada envio).
  if (corpo?.event === "messages.update") return Response.json({ ok: true, atualizadas: await registrarStatus(corpo.data) });
  // O estado da conexão é consultado direto na tela do WhatsApp.
  if (!corpo || corpo.event !== "messages.upsert") return Response.json({ ok: true });

  // Descobre a organização pela instância. Se não houver configuração, usa a organização padrão.
  const config = corpo.instance
    ? await db.configuracaoWhatsapp.findFirst({ where: { instancia: corpo.instance } })
    : null;
  const organizacaoId = config?.organizacaoId ?? (await getOrganizacaoPadrao()).id;

  const mensagens = (Array.isArray(corpo.data) ? corpo.data : [corpo.data]) as MensagemRecebida[];
  let salvas = 0;

  for (const m of mensagens) {
    const jid = m.key?.remoteJid?.includes("@lid") ? m.key.remoteJidAlt : m.key?.remoteJid;
    // Ignora grupos, status e listas de transmissão.
    if (!jid || !jid.endsWith("@s.whatsapp.net")) continue;

    const lida = interpretarMensagem(m.message);
    if (!lida) continue;

    const idExterno = m.key?.id ?? null;
    if (idExterno && (await db.mensagemWhatsapp.findFirst({ where: { organizacaoId, idExterno }, select: { id: true } }))) {
      continue; // já salva
    }

    let arquivo: string | null = null;
    if (lida.base64) {
      arquivo = await salvarArquivo(organizacaoId, Buffer.from(lida.base64, "base64"), lida.mimetype, lida.nomeArquivo).catch(
        (e) => {
          console.error("[webhook] não consegui gravar a mídia:", e);
          return null;
        },
      );
    }

    const quando = Number(m.messageTimestamp);
    const doCelularDaEmpresa = Boolean(m.key?.fromMe);
    const { nova, conversa } = await registrarMensagem({
      organizacaoId,
      telefone: jid.split("@")[0],
      // fromMe = mensagem enviada pelo celular da empresa (fora do CRM)
      direcao: doCelularDaEmpresa ? "SAIDA" : "ENTRADA",
      tipo: lida.tipo,
      conteudo: lida.conteudo,
      arquivo,
      mimetype: lida.mimetype ?? null,
      nomeArquivo: lida.nomeArquivo ?? null,
      status: doCelularDaEmpresa ? "enviada pelo celular" : null,
      idExterno,
      criadoEm: quando ? new Date(quando * 1000) : undefined,
      nomePerfil: doCelularDaEmpresa ? null : (m.pushName ?? null),
      doCliente: !doCelularDaEmpresa,
    });
    if (nova) salvas++;

    if (nova && conversa && !doCelularDaEmpresa) {
      const recebida = { conversa, tipo: lida.tipo, conteudo: lida.conteudo, criadoEm: quando ? new Date(quando * 1000) : new Date() };
      after(() => aoReceberDoCliente(recebida).catch((e) => console.error("[automação] falhou:", e)));
      // Webhooks de saída (Fase E): avisa outro sistema. Mídia vai só como descrição, sem o arquivo.
      after(() =>
        dispararEvento(organizacaoId, "mensagem.recebida", {
          conversaId: conversa.id,
          telefone: conversa.telefone,
          nomePerfil: conversa.nome,
          clienteId: conversa.clienteId,
          contatoId: conversa.contatoId,
          tipo: lida.tipo,
          conteudo: lida.conteudo,
          recebidaEm: recebida.criadoEm.toISOString(),
        }),
      );
    }
  }

  return Response.json({ ok: true, salvas });
}
