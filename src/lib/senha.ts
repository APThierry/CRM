import "server-only";
// Senhas com scrypt (já vem no Node). Nunca guardamos a senha, só o "hash":
// formato "scrypt$<sal>$<hash>", ambos em base64.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (senha: string, sal: Buffer, tamanho: number) => Promise<Buffer>;
const TAMANHO = 64;

export const SENHA_MINIMA = 8;

export async function gerarHashSenha(senha: string) {
  const sal = randomBytes(16);
  const hash = await scrypt(senha, sal, TAMANHO);
  return `scrypt$${sal.toString("base64")}$${hash.toString("base64")}`;
}

export async function conferirSenha(senha: string, guardado: string) {
  const [algoritmo, salB64, hashB64] = guardado.split("$");
  if (algoritmo !== "scrypt" || !salB64 || !hashB64) return false; // usuário sem senha definida
  const esperado = Buffer.from(hashB64, "base64");
  const calculado = await scrypt(senha, Buffer.from(salB64, "base64"), esperado.length);
  return timingSafeEqual(calculado, esperado);
}

/** true se o usuário já tem uma senha de verdade (não é um placeholder do seed). */
export const temSenha = (guardado: string) => guardado.startsWith("scrypt$");

export function validarSenhaNova(senha: string) {
  if (senha.length < SENHA_MINIMA) return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  return null;
}
