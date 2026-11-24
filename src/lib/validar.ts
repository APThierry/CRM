// Conferência do que as pessoas digitam: e-mail, textos de uma linha, tamanhos.
// Sem "server-only" e sem imports: contas puras.

export const EMAIL_MAXIMO = 254;

/** Minúsculas e sem espaços em volta. Não diz se é válido: use emailValido. */
export const normalizarEmail = (v: unknown) =>
  String(v ?? "")
    .slice(0, EMAIL_MAXIMO + 50)
    .trim()
    .toLowerCase();

const PARTE_LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMINIO = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]{2,59})$/;

/**
 * Um endereço só, no formato simples e sem acentos (já em minúsculas). Recusa
 * vírgulas, espaços, aspas, quebras de linha e nomes ("Ana <ana@x.com>"), que
 * poderiam fazer o e-mail sair para mais de uma pessoa.
 */
export function emailValido(email: string) {
  if (email.length > EMAIL_MAXIMO) return false;
  const arroba = email.lastIndexOf("@");
  if (arroba < 1 || arroba > 64) return false;
  return PARTE_LOCAL.test(email.slice(0, arroba)) && DOMINIO.test(email.slice(arroba + 1));
}

// Caracteres de controle (inclui quebras de linha) e separadores de linha do Unicode.
const CONTROLE = /[\p{Cc}\p{Zl}\p{Zp}]+/gu;
const NULO = new RegExp(String.fromCharCode(0), "g");

/** Texto de uma linha: tira quebras de linha e caracteres de controle e corta no tamanho. */
export function umaLinha(v: unknown, maximo: number) {
  return String(v ?? "")
    .replace(CONTROLE, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, maximo)
    .trim();
}

/** Campo opcional de formulário: vazio vira null, e corta no tamanho. */
export function opcional(v: FormDataEntryValue | null, maximo: number) {
  if (typeof v !== "string") return null;
  const limpo = v.replace(NULO, "").trim().slice(0, maximo);
  return limpo === "" ? null : limpo;
}

/**
 * Nome que vai dentro de um e-mail para outra pessoa: sem endereços de sites,
 * para ninguém usar o convite como propaganda ou golpe.
 */
export const nomeParaEmail = (nome: string) =>
  umaLinha(nome, 60).replace(/https?:\/\/\S*|www\.\S*|\S+\.[a-z]{2,}(?:\/\S*)?(?=\s|$)/gi, "…");

/** "1.234,56" -> 1234.56. Fora do que cabe no banco (12 dígitos, 2 casas) vira 0. */
export function lerValor(v: FormDataEntryValue | null) {
  const n = Number(String(v ?? "0").slice(0, 30).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 10_000_000_000 ? n : 0;
}

/** Inteiro entre os limites, ou null. */
export function inteiro(v: FormDataEntryValue | null, minimo: number, maximo: number) {
  const n = Number(v);
  return typeof v === "string" && v.trim() !== "" && Number.isInteger(n) && n >= minimo && n <= maximo ? n : null;
}
