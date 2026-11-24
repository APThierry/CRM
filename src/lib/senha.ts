import "server-only";
// Senhas com scrypt (já vem no Node). Nunca guardamos a senha, só o "hash":
// formato "scrypt$<sal>$<hash>", ambos em base64.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptLivre = promisify(scryptCallback) as (senha: string, sal: Buffer, tamanho: number) => Promise<Buffer>;
const TAMANHO = 64;

export const SENHA_MINIMA = 8;
export const SENHA_MAXIMA = 200;

/** Usuário que ainda não definiu a senha (não existe senha que bata com isto). */
export const SEM_SENHA = "sem-senha";

// --- Fila do scrypt -----------------------------------------------------------
// Cada conta usa 16 MB e ocupa uma das 4 threads do Node (as mesmas dos arquivos).
// Sem fila, uma rajada de logins travaria o servidor inteiro.

const SIMULTANEAS = 2;
const FILA_MAXIMA = 40;

export class ErroOcupado extends Error {
  constructor() {
    super("O servidor está ocupado. Tente de novo em alguns segundos.");
  }
}

type Fila = { rodando: number; pico: number; espera: (() => void)[] };
const guardado = globalThis as unknown as { filaScryptCrm?: Fila };
const fila = (guardado.filaScryptCrm ??= { rodando: 0, pico: 0, espera: [] });

async function scrypt(senha: string, sal: Buffer, tamanho: number) {
  if (fila.rodando >= SIMULTANEAS) {
    if (fila.espera.length >= FILA_MAXIMA) throw new ErroOcupado();
    await new Promise<void>((liberar) => fila.espera.push(liberar)); // quem sai passa a vaga para o próximo
  } else fila.rodando++;
  fila.pico = Math.max(fila.pico, fila.rodando);
  try {
    return await scryptLivre(senha, sal, tamanho);
  } finally {
    const proximo = fila.espera.shift();
    if (proximo) proximo();
    else fila.rodando--;
  }
}

/** Maior número de contas ao mesmo tempo desde que o servidor ligou (para os testes). */
export const picoScrypt = () => fila.pico;

// --- Senhas --------------------------------------------------------------------

export async function gerarHashSenha(senha: string) {
  const sal = randomBytes(16);
  const hash = await scrypt(senha, sal, TAMANHO);
  return `scrypt$${sal.toString("base64")}$${hash.toString("base64")}`;
}

// Hash sorteado quando o servidor liga: nenhuma senha bate com ele.
const HASH_FALSO = `scrypt$${randomBytes(16).toString("base64")}$${randomBytes(TAMANHO).toString("base64")}`;

/**
 * Confere a senha. Sem hash (conta que não existe) ou com usuário sem senha, faz a
 * conta do mesmo jeito contra um hash falso: o tempo de resposta não revela quem tem conta.
 */
export async function conferirSenha(senha: string, guardada: string | null | undefined) {
  if (senha.length > SENHA_MAXIMA) return false;
  const real = guardada && temSenha(guardada) ? guardada.split("$") : null;
  const [, salB64, hashB64] = real?.length === 3 ? real : HASH_FALSO.split("$");
  const esperado = Buffer.from(hashB64, "base64");
  const calculado = await scrypt(senha, Buffer.from(salB64, "base64"), esperado.length);
  return timingSafeEqual(calculado, esperado) && real !== null;
}

/** true se o usuário já tem uma senha de verdade (não é um placeholder do seed ou de um convite). */
export const temSenha = (guardada: string) => guardada.startsWith("scrypt$");

export function validarSenhaNova(senha: string) {
  if (senha.length < SENHA_MINIMA) return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  if (senha.length > SENHA_MAXIMA) return `A senha pode ter no máximo ${SENHA_MAXIMA} caracteres.`;
  return null;
}
