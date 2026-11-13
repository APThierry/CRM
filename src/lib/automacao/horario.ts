// Horário de atendimento: está aberto agora? Quando abre de novo?
//
// Sem "server-only" e sem banco: são contas puras, fáceis de testar.
// Horário de Brasília (America/Sao_Paulo). O Brasil não tem horário de verão
// desde 2019, então a diferença para o UTC é sempre de -3 horas.

export type Expediente = { aberto: boolean; inicio: string; fim: string };
/** 7 itens, de domingo (0) a sábado (6). */
export type Horarios = Expediente[];

export const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

export const HORARIOS_PADRAO: Horarios = [
  { aberto: false, inicio: "08:00", fim: "12:00" },
  { aberto: true, inicio: "08:00", fim: "18:00" },
  { aberto: true, inicio: "08:00", fim: "18:00" },
  { aberto: true, inicio: "08:00", fim: "18:00" },
  { aberto: true, inicio: "08:00", fim: "18:00" },
  { aberto: true, inicio: "08:00", fim: "18:00" },
  { aberto: true, inicio: "08:00", fim: "12:00" },
];

const FUSO_MINUTOS = -3 * 60;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Confere e completa o que veio do banco (JSON). */
export function lerHorarios(valor: unknown): Horarios {
  const lista = Array.isArray(valor) ? valor : [];
  return HORARIOS_PADRAO.map((padrao, i) => {
    const item = lista[i] as Partial<Expediente> | undefined;
    if (!item) return padrao;
    return {
      aberto: Boolean(item.aberto),
      inicio: typeof item.inicio === "string" && HORA.test(item.inicio) ? item.inicio : padrao.inicio,
      fim: typeof item.fim === "string" && HORA.test(item.fim) ? item.fim : padrao.fim,
    };
  });
}

export const horaValida = (h: string) => HORA.test(h);
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/** Dia da semana e minuto do dia no horário de Brasília. */
function local(d: Date) {
  const l = new Date(d.getTime() + FUSO_MINUTOS * 60_000);
  return { dia: l.getUTCDay(), minuto: l.getUTCHours() * 60 + l.getUTCMinutes() };
}

export function estaAberto(horarios: Horarios, agora = new Date()) {
  const { dia, minuto } = local(agora);
  const e = horarios[dia];
  return e.aberto && minuto >= minutos(e.inicio) && minuto < minutos(e.fim);
}

/** Próximo momento em que o atendimento abre (ou `agora`, se já estiver aberto). */
export function proximaAbertura(horarios: Horarios, agora = new Date()): Date {
  if (estaAberto(horarios, agora)) return agora;
  // Meia-noite (de Brasília) de hoje, em UTC.
  const l = new Date(agora.getTime() + FUSO_MINUTOS * 60_000);
  const meiaNoite = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - FUSO_MINUTOS * 60_000;
  for (let d = 0; d <= 7; d++) {
    const dia = (l.getUTCDay() + d) % 7;
    const e = horarios[dia];
    if (!e.aberto || minutos(e.fim) <= minutos(e.inicio)) continue;
    const abre = new Date(meiaNoite + d * 86_400_000 + minutos(e.inicio) * 60_000);
    if (abre > agora) return abre;
  }
  return agora; // nenhum dia aberto: não adia
}

/** "seg a sex, 08:00 às 18:00; sáb, 08:00 às 12:00" — para a variável {horario}. */
export function descreverHorarios(horarios: Horarios) {
  const grupos: { dias: number[]; inicio: string; fim: string }[] = [];
  // Começa na segunda para "seg a sex" ficar junto; domingo vai para o fim.
  for (const i of [1, 2, 3, 4, 5, 6, 0]) {
    const e = horarios[i];
    if (!e.aberto) continue;
    const ultimo = grupos.at(-1);
    const seguido = ultimo && ultimo.inicio === e.inicio && ultimo.fim === e.fim && (ultimo.dias.at(-1)! + 1) % 7 === i;
    if (seguido) ultimo.dias.push(i);
    else grupos.push({ dias: [i], inicio: e.inicio, fim: e.fim });
  }
  if (grupos.length === 0) return "sem horário definido";
  return grupos
    .map((g) => {
      const dias =
        g.dias.length === 1
          ? DIAS_CURTOS[g.dias[0]]
          : g.dias.length === 2
            ? `${DIAS_CURTOS[g.dias[0]]} e ${DIAS_CURTOS[g.dias[1]]}`
            : `${DIAS_CURTOS[g.dias[0]]} a ${DIAS_CURTOS[g.dias.at(-1)!]}`;
      return `${dias}, ${g.inicio} às ${g.fim}`;
    })
    .join("; ");
}

/** "2026-11-13T09:30" (campo datetime-local, horário de Brasília) para Date. */
export function lerDataLocal(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date para o valor de um campo datetime-local, no horário de Brasília. */
export function paraDataLocal(d: Date) {
  return new Date(d.getTime() + FUSO_MINUTOS * 60_000).toISOString().slice(0, 16);
}
