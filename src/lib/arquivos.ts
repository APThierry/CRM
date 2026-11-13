import "server-only";
// Arquivos de mídia do WhatsApp (fotos, áudios, vídeos, documentos).
//
// Ficam FORA da pasta do projeto (padrão: ../crm-arquivos, ou ARQUIVOS_DIR).
// Dentro do projeto, cada arquivo novo faria o `next dev` recarregar a página.
// No banco guardamos só o caminho relativo, ex.: "org123/2026-11/abc.jpg".
// Quem baixa é a rota /api/arquivos/[...caminho], que confere o login.
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";

// O comentário turbopackIgnore avisa ao build que esta pasta é de dados (não
// é código): sem ele, o build copiaria o projeto inteiro para o pacote do servidor.
const PASTA = resolve(/*turbopackIgnore: true*/ process.env.ARQUIVOS_DIR ?? join(process.cwd(), "..", "crm-arquivos"));

/** Limite para enviar pelo CRM (o WhatsApp aceita até 16 MB para mídia). */
export const TAMANHO_MAXIMO = 16 * 1024 * 1024;

const EXTENSOES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/webm": ".webm",
  "video/mp4": ".mp4",
  "video/3gpp": ".3gp",
  "application/pdf": ".pdf",
};

function extensao(mimetype: string | null | undefined, nomeArquivo?: string | null) {
  const doNome = nomeArquivo ? extname(nomeArquivo).toLowerCase() : "";
  if (/^\.[a-z0-9]{1,8}$/.test(doNome)) return doNome;
  const tipo = (mimetype ?? "").split(";")[0].trim();
  return EXTENSOES[tipo] ?? ".bin";
}

/** Grava o arquivo e devolve o caminho relativo para guardar no banco. */
export async function salvarArquivo(organizacaoId: string, conteudo: Buffer, mimetype?: string | null, nomeArquivo?: string | null) {
  const mes = new Date().toISOString().slice(0, 7);
  const relativo = [organizacaoId, mes, randomBytes(12).toString("hex") + extensao(mimetype, nomeArquivo)].join("/");
  const completo = join(PASTA, relativo);
  await mkdir(dirname(completo), { recursive: true });
  await writeFile(completo, conteudo);
  return relativo;
}

/** Lê um arquivo da organização. Recusa caminhos que tentem sair da pasta. */
export async function lerArquivo(organizacaoId: string, relativo: string) {
  const limpo = normalize(relativo).replace(/^([/\\])+/, "");
  if (!limpo.startsWith(organizacaoId + sep) && !limpo.startsWith(organizacaoId + "/")) return null;
  const completo = resolve(PASTA, limpo);
  if (!completo.startsWith(PASTA + sep)) return null;
  return readFile(completo).catch(() => null);
}
