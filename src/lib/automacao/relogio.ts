import "server-only";
// O "relógio" da automação: a cada 30 segundos envia as mensagens agendadas
// que já passaram da hora e a próxima mensagem das campanhas (src/lib/campanhas/motor.ts). Começa junto com o servidor (src/instrumentation.ts).
//
// Na VPS rodamos UM processo do CRM, então não há dois relógios disputando.
// Mesmo assim cada mensagem é "reservada" (PENDENTE -> ENVIANDO) antes de sair,
// para nunca ser enviada duas vezes.
import { preencherVariaveis } from "@/lib/atendimento";
import { processarCampanhas } from "@/lib/campanhas/motor";
import { db } from "@/lib/db";
import { enviarAutomatico } from "@/lib/whatsapp/enviar";
import { ErroWhatsapp, garantirWebhook } from "@/lib/whatsapp/evolution";

const INTERVALO = 30_000;
const POR_RODADA = 20;
/** Pausa entre um envio e outro, para não parecer robô para o WhatsApp. */
const PAUSA_ENTRE_ENVIOS = 1_500;

export async function processarAgendadas(agora = new Date()) {
  // Ficou "enviando" por mais de 10 min (servidor caiu no meio)? Não reenvia: marca erro.
  await db.mensagemAgendada.updateMany({
    where: { status: "ENVIANDO", enviarEm: { lt: new Date(agora.getTime() - 10 * 60_000) } },
    data: { status: "ERRO", motivo: "envio interrompido (o servidor reiniciou?)" },
  });

  const vencidas = await db.mensagemAgendada.findMany({
    where: { status: "PENDENTE", enviarEm: { lte: agora } },
    orderBy: { enviarEm: "asc" },
    take: POR_RODADA,
    include: {
      usuario: { select: { id: true, nome: true, assinaturaWhatsapp: true, ativo: true } },
      conversa: { include: { contato: { select: { nome: true } }, cliente: { select: { nome: true } }, organizacao: { select: { nome: true } } } },
    },
  });

  let enviadas = 0;
  for (const a of vencidas) {
    const reservou = await db.mensagemAgendada.updateMany({ where: { id: a.id, status: "PENDENTE" }, data: { status: "ENVIANDO" } });
    if (!reservou.count) continue;
    const { conversa, usuario } = a;
    try {
      const texto = preencherVariaveis(a.texto, {
        nome: conversa.contato?.nome ?? conversa.nome ?? conversa.cliente?.nome,
        atendente: usuario?.nome,
        empresa: conversa.organizacao.nome,
      });
      // Usuário desativado: a mensagem sai sem assinatura.
      await enviarAutomatico(conversa, texto, usuario?.ativo ? usuario : null);
      await db.mensagemAgendada.update({ where: { id: a.id }, data: { status: "ENVIADA", enviadaEm: new Date() } });
      enviadas++;
    } catch (e) {
      const motivo = e instanceof ErroWhatsapp ? e.message : "erro inesperado no envio";
      console.error(`[relógio] não consegui enviar a agendada ${a.id}:`, e);
      await db.mensagemAgendada.update({ where: { id: a.id }, data: { status: "ERRO", motivo: motivo.slice(0, 300) } });
    }
    await new Promise((r) => setTimeout(r, PAUSA_ENTRE_ENVIOS));
  }
  return { enviadas, vistas: vencidas.length };
}

const global = globalThis as unknown as { relogioCrm?: NodeJS.Timeout };

export function iniciarRelogio() {
  if (global.relogioCrm) return;
  let rodando = false;
  const rodada = async () => {
    if (rodando) return; // a rodada anterior ainda não terminou
    rodando = true;
    try {
      const r = await processarAgendadas();
      if (r.vistas) console.log(`[relógio] ${r.enviadas} de ${r.vistas} mensagem(ns) agendada(s) enviada(s)`);
    } catch (e) {
      console.error("[relógio] falhou:", e);
    }
    // Campanhas (Fase D): no máximo uma mensagem por organização a cada rodada.
    try {
      const c = await processarCampanhas();
      if (c.enviadas) console.log(`[relógio] ${c.enviadas} mensagem(ns) de campanha enviada(s)`);
    } catch (e) {
      console.error("[relógio] campanhas falharam:", e);
    } finally {
      rodando = false;
    }
  };
  global.relogioCrm = setInterval(rodada, INTERVALO);
  global.relogioCrm.unref?.();
  setTimeout(rodada, 5_000); // uma rodada logo depois de ligar
  // Garante que a Evolution API manda também os avisos de entregue/lida (campanhas).
  garantirWebhook().catch((e) => console.warn("[relógio] não consegui atualizar o webhook do WhatsApp:", e instanceof Error ? e.message : e));
  console.log("[relógio] automação ligada: conferindo mensagens agendadas a cada 30 s");
}
