import "server-only";
// Arquivos de mídia do WhatsApp (fotos, áudios, vídeos, documentos).
//
// Ficam FORA da pasta do projeto (padrão: ../crm-arquivos, ou ARQUIVOS_DIR).
// Dentro do projeto, cada arquivo novo faria o `next dev` recarregar a página.
// No banco guardamos só o caminho relativo, ex.: "org123/2026-11/abc.jpg".
// Quem baixa é a rota /api/arquivos/[...caminho], que confere o login.
//
// Cada empresa tem uma cota de espaço (LIMITES.arquivosMb). O total usado fica em
// Organizacao.arquivosKb e sobe numa instrução só: envios ao mesmo tempo não passam da cota.
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { LIMITES } from "@/lib/ambiente";
import { db } from "@/lib/db";

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

// --- Cota de espaço por empresa ---------------------------------------------------

export const ERRO_ESPACO = "O espaço para arquivos da empresa acabou. Fale com o suporte do CRM.";

const emKb = (bytes: number) => Math.max(1, Math.ceil(bytes / 1024));

/** Soma o que já existe na pasta da empresa (só na primeira vez). */
async function medirPasta(pasta: string): Promise<number> {
  const itens = await readdir(pasta, { withFileTypes: true }).catch(() => []);
  let kb = 0;
  for (const item of itens) {
    const caminho = join(pasta, item.name);
    if (item.isDirectory()) kb += await medirPasta(caminho);
    else if (item.isFile()) kb += emKb((await stat(caminho).catch(() => ({ size: 0 }))).size);
  }
  return kb;
}

/** Separa espaço para um arquivo. Retorna false se passaria da cota da empresa. */
export async function reservarEspaco(organizacaoId: string, bytes: number) {
  const org = await db.organizacao.findUniqueOrThrow({ where: { id: organizacaoId }, select: { arquivosKb: true, campanhasLiberadas: true } });
  if (org.arquivosKb === null) {
    const medido = await medirPasta(join(PASTA, organizacaoId));
    await db.organizacao.updateMany({ where: { id: organizacaoId, arquivosKb: null }, data: { arquivosKb: medido } });
  }
  const cota = LIMITES.arquivosMb(org.campanhasLiberadas) * 1024;
  const kb = emKb(bytes);
  const coube = await db.organizacao.updateMany({ where: { id: organizacaoId, arquivosKb: { lte: cota - kb } }, data: { arquivosKb: { increment: kb } } });
  return coube.count === 1;
}

/** O arquivo não foi gravado: devolve o espaço separado. */
export const devolverEspaco = (organizacaoId: string, bytes: number) =>
  db.organizacao.updateMany({ where: { id: organizacaoId, arquivosKb: { gte: emKb(bytes) } }, data: { arquivosKb: { decrement: emKb(bytes) } } });

/**
 * Grava uma mídia recebida, se couber no tamanho máximo e na cota da empresa.
 * Não coube: devolve o motivo (a mensagem é gravada assim mesmo, sem o arquivo).
 */
export async function guardarRecebido(organizacaoId: string, base64: string, mimetype?: string | null, nomeArquivo?: string | null): Promise<{ caminho?: string; motivo?: string }> {
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > LIMITES.midiaRecebidaMb() * 1024 * 1024) return { motivo: "arquivo grande demais" };
  if (!(await reservarEspaco(organizacaoId, bytes))) return { motivo: "sem espaço para arquivos" };
  try {
    return { caminho: await gravarArquivo(organizacaoId, Buffer.from(base64, "base64"), mimetype, nomeArquivo) };
  } catch (e) {
    await devolverEspaco(organizacaoId, bytes);
    throw e;
  }
}

/** Grava o arquivo e devolve o caminho relativo para guardar no banco. Reserve o espaço antes. */
export async function gravarArquivo(organizacaoId: string, conteudo: Buffer, mimetype?: string | null, nomeArquivo?: string | null) {
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
