// Regras de proteção dos disparos (Fase D). Contas puras, sem banco: fáceis de testar.
//
// O WhatsApp bane números que mandam muitas mensagens iguais, rápido demais,
// para gente que não respondeu. Por isso as campanhas saem DEVAGAR:
// - uma mensagem a cada 60 a 120 segundos (sorteado);
// - uma pausa de 10 minutos a cada 30 envios;
// - no máximo 150 mensagens por dia (somando todas as campanhas);
// - só dentro do horário de atendimento;
// - cada mensagem com uma variação do texto ({Olá|Oi}) e o convite para sair.
// Ritmo escolhido pela Brigada MG em 13/11/2026 ("conservador").

export const RITMO = {
  intervaloMinSeg: 60,
  intervaloMaxSeg: 120,
  pausaACada: 30,
  pausaMin: 10,
  limitePorDia: 150,
  /** Erros seguidos que pausam a campanha (algo está errado com o WhatsApp). */
  errosParaPausar: 3,
} as const;

/** Palavras que descadastram (o cliente responde só isso). */
const PALAVRAS_SAIR = ["sair", "parar", "pare", "cancelar", "stop", "descadastrar", "remover"];

export const RODAPE_SAIR = "\n\n_Para não receber mais estas mensagens, responda SAIR._";

export const CONFIRMACAO_SAIR =
  "Pronto! Você não vai mais receber nossas mensagens de campanha. Se precisar de algo, é só chamar por aqui.";

/** "Sair", " SAIR! " e "parar." descadastram; "quero sair da turma de sábado" não. */
export function querSair(texto: string) {
  const limpo = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, "")
    .trim();
  return PALAVRAS_SAIR.includes(limpo);
}

/**
 * Sorteia uma opção de cada grupo {Olá|Oi|Bom dia}. Grupos sem "|" (variáveis
 * como {nome}) ficam como estão.
 */
export function variar(texto: string, sortear: () => number = Math.random) {
  return texto.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, opcoes: string) => {
    const lista = opcoes.split("|");
    return lista[Math.floor(sortear() * lista.length)] ?? "";
  });
}

/** Quanto esperar depois do envio número `enviadas` (contando este). Em milissegundos. */
export function esperaDepoisDe(enviadas: number, sortear: () => number = Math.random) {
  if (enviadas > 0 && enviadas % RITMO.pausaACada === 0) return RITMO.pausaMin * 60_000;
  const seg = RITMO.intervaloMinSeg + Math.round(sortear() * (RITMO.intervaloMaxSeg - RITMO.intervaloMinSeg));
  return seg * 1000;
}

/** Meia-noite de hoje no horário de Brasília (UTC-3, sem horário de verão). */
export function inicioDoDia(agora = new Date()) {
  const l = new Date(agora.getTime() - 3 * 3_600_000);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) + 3 * 3_600_000);
}

/** Estimativa de duração: "≈ 2 h 30 min" para mostrar antes de iniciar. */
export function estimarDuracao(quantidade: number) {
  if (quantidade <= 0) return "—";
  const medioSeg = (RITMO.intervaloMinSeg + RITMO.intervaloMaxSeg) / 2;
  const pausas = Math.floor((quantidade - 1) / RITMO.pausaACada);
  const minutos = Math.round(((quantidade - 1) * medioSeg) / 60 + pausas * RITMO.pausaMin);
  const dias = Math.ceil(quantidade / RITMO.limitePorDia);
  const h = Math.floor(minutos / 60);
  const texto = h ? `${h} h ${minutos % 60} min` : `${Math.max(minutos, 1)} min`;
  return dias > 1 ? `≈ ${dias} dias (limite de ${RITMO.limitePorDia} por dia)` : `≈ ${texto}`;
}
