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
import { LIMITES } from "@/lib/ambiente";
import { guardarRecebido } from "@/lib/arquivos";
import { db } from "@/lib/db";
import { dispararEvento } from "@/lib/webhooks/disparar";
import { empresaDaInstancia } from "@/lib/whatsapp/instancia";
import { interpretarMensagem, registrarMensagem, type ConteudoWhatsapp } from "@/lib/whatsapp/mensagens";

type MensagemRecebida = {
  key?: { id?: string; remoteJid?: string; remoteJidAlt?: string; fromMe?: boolean };
  pushName?: string;
  message?: ConteudoWhatsapp;
  messageTimestamp?: number | string;
};

function lerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/** Confere o segredo enviado no cabeçalho, para recusar chamadas de terceiros. */
function segredoValido(recebido: string | null) {
  const esperado = process.env.WHATSAPP_WEBHOOK_SEGREDO ?? "";
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Lê o corpo até o limite. Maior que isso = null (não carrega tudo na memória). */
async function lerCorpo(request: Request, maximo: number) {
  if (Number(request.headers.get("content-length") ?? 0) > maximo) return null;
  const partes: Uint8Array[] = [];
  let total = 0;
  const leitor = request.body?.getReader();
  while (leitor) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximo) {
      await leitor.cancel();
      return null;
    }
    partes.push(value);
  }
  return Buffer.concat(partes).toString("utf8");
}

export async function POST(request: Request) {
  if (!segredoValido(request.headers.get("x-crm-segredo"))) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }

  // Mídia em base64 ocupa 4/3 do tamanho. A folga é para documentos um pouco acima do
  // limite: esses entram como mensagem, só sem o arquivo. Muito acima, recusamos com 422
  // (a Evolution API não tenta de novo).
  const texto = await lerCorpo(request, LIMITES.midiaRecebidaMb() * 4 * 1024 * 1024 + 1024 * 1024);
  if (texto === null) {
    console.warn("[webhook] aviso do WhatsApp grande demais, ignorado");
    return Response.json({ erro: "grande demais" }, { status: 422 });
  }
  const corpo = lerJson(texto) as { event?: string; instance?: string; data?: unknown } | null;
  // O estado da conexão é consultado direto na tela do WhatsApp.
  if (!corpo || (corpo.event !== "messages.upsert" && corpo.event !== "messages.update")) return Response.json({ ok: true });

  // Cada número de WhatsApp (instância) é de UMA empresa. Instância desconhecida
  // é ignorada: nunca jogamos a mensagem numa empresa "padrão", senão uma empresa
  // poderia ver a conversa de outra.
  const organizacaoId = await empresaDaInstancia(corpo.instance);
  if (!organizacaoId) {
    console.warn(`[webhook] instância desconhecida: ${JSON.stringify(corpo.instance ?? null)}. Mensagem ignorada.`);
    return Response.json({ ok: true, ignorada: "instância desconhecida" });
  }

  // Avisos de "entregue" e "lida": só interessam às campanhas (status de cada envio).
  if (corpo.event === "messages.update") return Response.json({ ok: true, atualizadas: await registrarStatus(organizacaoId, corpo.data) });

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
      const r = await guardarRecebido(organizacaoId, lida.base64, lida.mimetype, lida.nomeArquivo).catch((e) => {
        console.error("[webhook] não consegui gravar a mídia:", e);
        return { caminho: undefined, motivo: "erro ao guardar o arquivo" };
      });
      arquivo = r.caminho ?? null;
      if (r.motivo) lida.conteudo = `${lida.conteudo}\n(${r.motivo}: não foi guardado, veja no celular)`;
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
