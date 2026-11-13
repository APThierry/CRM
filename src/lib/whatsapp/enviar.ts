import "server-only";
// Envio de mensagens pelo CRM (texto, foto, vídeo, áudio, documento).
// Usado pela Central de atendimento e pela ficha do cliente.
import type { Conversa } from "@/generated/prisma/client";
import type { UsuarioAtual } from "@/lib/auth";
import { salvarArquivo, TAMANHO_MAXIMO } from "@/lib/arquivos";
import { db } from "@/lib/db";
import { enviarAudio, enviarMidia, enviarTexto, ErroWhatsapp } from "@/lib/whatsapp/evolution";
import { registrarMensagem } from "@/lib/whatsapp/mensagens";

/** "*Ana:*\nBom dia!" quando a pessoa usa assinatura (negrito no WhatsApp). */
export function assinar(eu: Pick<UsuarioAtual, "nome" | "assinaturaWhatsapp">, texto: string) {
  if (!eu.assinaturaWhatsapp || !texto) return texto;
  return `*${eu.nome.split(" ")[0]}:*\n${texto}`;
}

function tipoDoArquivo(mimetype: string) {
  if (mimetype.startsWith("image/") && mimetype !== "image/svg+xml") return { evolution: "image", tipo: "IMAGEM" } as const;
  if (mimetype.startsWith("video/")) return { evolution: "video", tipo: "VIDEO" } as const;
  if (mimetype.startsWith("audio/")) return { evolution: "audio", tipo: "AUDIO" } as const;
  return { evolution: "document", tipo: "DOCUMENTO" } as const;
}

export type ResultadoEnvio = { erro?: string; ok?: boolean };

/**
 * Envia texto e/ou um arquivo na conversa. Se a conversa estiver na fila
 * (sem atendente), quem respondeu passa a ser o atendente dela.
 */
export async function enviarNaConversa(
  eu: UsuarioAtual,
  conversa: Pick<Conversa, "id" | "organizacaoId" | "telefone" | "atendenteId">,
  { texto, arquivo }: { texto?: string; arquivo?: File | null },
): Promise<ResultadoEnvio> {
  const limpo = (texto ?? "").trim();
  const temArquivo = arquivo && arquivo.size > 0;
  if (!limpo && !temArquivo) return { erro: "Escreva a mensagem ou escolha um arquivo." };
  if (temArquivo && arquivo.size > TAMANHO_MAXIMO) return { erro: "Arquivo grande demais (máximo 16 MB)." };

  const numero = conversa.telefone;
  try {
    if (temArquivo) {
      const mimetype = arquivo.type || "application/octet-stream";
      const { evolution, tipo } = tipoDoArquivo(mimetype);
      const conteudoArquivo = Buffer.from(await arquivo.arrayBuffer());
      const base64 = conteudoArquivo.toString("base64");

      // Áudio não tem legenda no WhatsApp: se houver texto, ele vai numa mensagem separada.
      const legenda = evolution === "audio" ? "" : assinar(eu, limpo);
      const { idExterno } =
        evolution === "audio"
          ? await enviarAudio(numero, base64)
          : await enviarMidia(numero, { tipo: evolution, base64, mimetype, nomeArquivo: arquivo.name, legenda });

      const caminho = await salvarArquivo(conversa.organizacaoId, conteudoArquivo, mimetype, arquivo.name);
      const padrao = { IMAGEM: "📷 Imagem", VIDEO: "🎥 Vídeo", AUDIO: "🎤 Áudio", DOCUMENTO: `📎 ${arquivo.name}` }[tipo];
      await registrarMensagem({
        organizacaoId: conversa.organizacaoId,
        telefone: numero,
        direcao: "SAIDA",
        tipo,
        conteudo: (evolution !== "audio" && limpo) || padrao,
        arquivo: caminho,
        mimetype,
        nomeArquivo: arquivo.name,
        status: "enviada",
        idExterno,
        usuarioId: eu.id,
      });
      if (evolution === "audio" && limpo) await enviarSoTexto(eu, conversa, limpo);
    } else {
      await enviarSoTexto(eu, conversa, limpo);
    }
  } catch (e) {
    return { erro: e instanceof ErroWhatsapp ? e.message : "Não foi possível enviar a mensagem." };
  }

  // Quem responde "puxa" a conversa da fila e zera as não lidas.
  await db.conversa.update({
    where: { id: conversa.id },
    // Uma pessoa respondeu: o chatbot sai de cena.
    data: { naoLidas: 0, status: "ABERTA", botEtapa: null, ...(conversa.atendenteId ? {} : { atendenteId: eu.id }) },
  });
  return { ok: true };
}

/**
 * Envio feito pelo próprio CRM (chatbot, horário de atendimento, agendamentos).
 * Com `autor`, a mensagem sai assinada por ele (agendada por uma pessoa); sem
 * autor, sai como "automática". Não mexe no atendente nem nas não lidas.
 * Lança ErroWhatsapp se a Evolution API recusar.
 */
export async function enviarAutomatico(
  conversa: Pick<Conversa, "organizacaoId" | "telefone">,
  texto: string,
  autor?: Pick<UsuarioAtual, "id" | "nome" | "assinaturaWhatsapp"> | null,
  /** Como aparece na conversa (padrão: "agendada" ou "automática"). Campanhas usam "campanha". */
  rotulo?: string,
) {
  const { idExterno } = await enviarTexto(conversa.telefone, autor ? assinar(autor, texto) : texto);
  await registrarMensagem({
    organizacaoId: conversa.organizacaoId,
    telefone: conversa.telefone,
    direcao: "SAIDA",
    conteudo: texto,
    status: rotulo ?? (autor ? "agendada" : "automática"),
    idExterno,
    usuarioId: autor?.id ?? null,
  });
  return { idExterno };
}

async function enviarSoTexto(eu: UsuarioAtual, conversa: Pick<Conversa, "organizacaoId" | "telefone">, texto: string) {
  const { idExterno } = await enviarTexto(conversa.telefone, assinar(eu, texto));
  await registrarMensagem({
    organizacaoId: conversa.organizacaoId,
    telefone: conversa.telefone,
    direcao: "SAIDA",
    conteudo: texto,
    status: "enviada",
    idExterno,
    usuarioId: eu.id,
  });
}
