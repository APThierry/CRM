// Roda uma vez quando o servidor do Next.js liga.
// Aqui começa o relógio da automação (mensagens agendadas e follow-ups).
// Para desligar o relógio (ex.: num segundo servidor), use AUTOMACAO_DESLIGADA=1.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.AUTOMACAO_DESLIGADA === "1") return;
  const { iniciarRelogio } = await import("./lib/automacao/relogio");
  iniciarRelogio();
}
