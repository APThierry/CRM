// Funções pequenas de formatação usadas nas telas.

const moedaBR = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });
const dataHoraBR = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export const moeda = (v: number | { toString(): string } | null | undefined) =>
  moedaBR.format(Number(v ?? 0));

export const data = (d: Date | null | undefined) => (d ? dataBR.format(d) : "—");

/** Data no formato do <input type="date"> (aaaa-mm-dd), no fuso de Brasília. */
const dataISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
export const paraInputData = (d: Date | null | undefined) => (d ? dataISO.format(d) : "");

/** "2026-11-20" (do formulário) -> Date às 08:00 de Brasília. */
export const deInputData = (v: string | null | undefined) => (v ? new Date(`${v}T08:00:00-03:00`) : null);

/** 12345678901 -> 123.456.789-01 */
export function cpf(v: string | null | undefined) {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : v ?? "";
}
export const dataHora = (d: Date | null | undefined) => (d ? dataHoraBR.format(d) : "—");

/** Mantém só os dígitos e garante o código do Brasil (55). */
export function normalizarWhatsapp(telefone: string | null | undefined) {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  return digitos.startsWith("55") ? digitos : `55${digitos}`;
}

/** Link que abre a conversa no WhatsApp (celular ou WhatsApp Web). */
export function linkWhatsapp(telefone: string | null | undefined, texto?: string) {
  const numero = normalizarWhatsapp(telefone);
  if (!numero) return null;
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

/** 5531990000001 -> (31) 99000-0001 */
export function telefone(t: string | null | undefined) {
  const d = (t ?? "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t ?? "";
}
