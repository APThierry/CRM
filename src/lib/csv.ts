// Planilhas CSV que abrem direto no Excel em português:
// - separador ";" (o Excel brasileiro usa vírgula como decimal);
// - BOM no início, para os acentos aparecerem certos;
// - números com vírgula decimal;
// - células que começam com = + - @ ganham um apóstrofo, para o Excel não
//   executar fórmulas vindas dos dados (ex.: um cliente chamado "=HYPERLINK(...)").

export type Celula = string | number | boolean | Date | null | undefined;

const dataBR = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });
const dataHoraBR = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

function texto(v: Celula, comHora: boolean) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return comHora ? dataHoraBR.format(v) : dataBR.format(v);
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace(".", ",") : "";
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

const aspas = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Monta o CSV. `comHora`: colunas de data que devem mostrar a hora também. */
export function gerarCsv(cabecalho: string[], linhas: Celula[][], comHora: number[] = []) {
  const corpo = [cabecalho.map(aspas).join(";"), ...linhas.map((l) => l.map((c, i) => aspas(texto(c, comHora.includes(i)))).join(";"))];
  return `﻿${corpo.join("\r\n")}\r\n`;
}
