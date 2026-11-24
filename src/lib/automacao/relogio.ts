import "server-only";
// O "relógio" da automação: a cada 30 segundos envia as mensagens agendadas que já
// passaram da hora, a próxima mensagem das campanhas (src/lib/campanhas/motor.ts) e os
// avisos de webhook (src/lib/webhooks/disparar.ts). Começa junto com o servidor
// (src/instrumentation.ts). De hora em hora, apaga o que venceu.
//
// Várias empresas usam o mesmo relógio: cada rodada é dividida entre elas em rodízio
// (./rodizio.ts), e as três tarefas são independentes. Uma empresa com a fila cheia, ou
// com o WhatsApp travado, não segura as outras.
//
// Na VPS rodamos UM processo do CRM, então não há dois relógios disputando.
// Mesmo assim cada mensagem é "reservada" (PENDENTE -> ENVIANDO) antes de sair,
// para nunca ser enviada duas vezes.
import type { Prisma } from "@/generated/prisma/client";
import { preencherVariaveis } from "@/lib/atendimento";
import { processarCampanhas } from "@/lib/campanhas/motor";
import { limparContasVencidas } from "@/lib/conta";
import { db } from "@/lib/db";
import { ondeLiberada } from "@/lib/empresas/situacao";
import { ErroLimiteEnvio } from "@/lib/whatsapp/cota";
import { enviarAutomatico } from "@/lib/whatsapp/enviar";
import { ErroWhatsapp, garantirWebhook } from "@/lib/whatsapp/evolution";
import { limparEntregasAntigas, processarWebhooks } from "@/lib/webhooks/disparar";
import { inicioDoDia } from "@/lib/campanhas/ritmo";
import { cotaPorEmpresa, emParalelo, escolherEmpresas } from "./rodizio";

const INTERVALO = 30_000;
/** Agendadas por rodada, divididas entre as empresas que têm mensagem na hora. */
export const POR_RODADA = 40;
/** Máximo de uma empresa por rodada: com a pausa, cabe nos 30 segundos. */
const POR_EMPRESA = 15;
/** Empresas enviando ao mesmo tempo (cada uma tem o próprio número). */
const EMPRESAS_JUNTAS = 5;
/** Passou disso, a empresa continua na próxima rodada (WhatsApp lento não segura as outras). */
const TEMPO_POR_EMPRESA = 25_000;
/** Pausa entre um envio e outro, para não parecer robô para o WhatsApp. */
const PAUSA_ENTRE_ENVIOS = 1_500;
/** Mais atrasada que isso não sai: evita uma rajada de mensagens velhas depois de uma parada. */
const ATRASO_MAXIMO = 24 * 3600_000;

type OpcoesRodada = {
  /** Só estas empresas (usado pelos testes, para não tocar nas outras). */
  apenas?: string[];
  /** Pausa entre envios (os testes usam 0). */
  pausaMs?: number;
};

const incluirNaRodada = {
  usuario: { select: { id: true, nome: true, assinaturaWhatsapp: true, ativo: true } },
  conversa: { include: { contato: { select: { nome: true } }, cliente: { select: { nome: true } }, organizacao: { select: { nome: true } } } },
} satisfies Prisma.MensagemAgendadaInclude;
type Agendada = Prisma.MensagemAgendadaGetPayload<{ include: typeof incluirNaRodada }>;

export async function processarAgendadas(agora = new Date(), { apenas, pausaMs = PAUSA_ENTRE_ENVIOS }: OpcoesRodada = {}) {
  const daEmpresa = apenas ? { organizacaoId: { in: apenas } } : {};
  // Empresa suspensa ou com o teste vencido: as agendadas esperam.
  const liberada = { ...daEmpresa, organizacao: ondeLiberada(agora) };

  // Ficou "enviando" por mais de 10 min (servidor caiu no meio)? Não reenvia: marca erro.
  await db.mensagemAgendada.updateMany({
    where: { ...daEmpresa, status: "ENVIANDO", enviarEm: { lt: new Date(agora.getTime() - 10 * 60_000) } },
    data: { status: "ERRO", motivo: "envio interrompido (o servidor reiniciou?)" },
  });
  // Atrasada demais (o servidor ficou desligado, a empresa ficou suspensa): não sai mais.
  await db.mensagemAgendada.updateMany({
    where: { ...liberada, status: "PENDENTE", enviarEm: { lt: new Date(agora.getTime() - ATRASO_MAXIMO) } },
    data: { status: "ERRO", motivo: "passou mais de 24 horas da hora marcada: não foi enviada" },
  });

  const naHora = await db.mensagemAgendada.groupBy({ by: ["organizacaoId"], where: { ...liberada, status: "PENDENTE", enviarEm: { lte: agora } } });
  const empresas = escolherEmpresas("agendadas", naHora.map((g) => g.organizacaoId), POR_RODADA);
  if (empresas.length === 0) return { enviadas: 0, vistas: 0 };
  const cota = cotaPorEmpresa(POR_RODADA, empresas.length, POR_EMPRESA);

  // As primeiras `cota` de cada empresa, numa consulta só.
  const escolhidas = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM (
      SELECT id, row_number() OVER (PARTITION BY "organizacaoId" ORDER BY "enviarEm", id) AS posicao
      FROM "MensagemAgendada"
      WHERE status = 'PENDENTE' AND "enviarEm" <= ${agora.toISOString()}::timestamp AND "organizacaoId" = ANY(${empresas})
    ) fila WHERE posicao <= ${cota}`;
  const vencidas = await db.mensagemAgendada.findMany({
    where: { id: { in: escolhidas.map((e) => e.id) } },
    orderBy: [{ enviarEm: "asc" }, { id: "asc" }],
    include: incluirNaRodada,
  });

  // Empresas em paralelo; dentro de cada uma, uma mensagem por vez (é um número só).
  const enviadas = await emParalelo(
    empresas,
    EMPRESAS_JUNTAS,
    async (org) => {
      const limite = Date.now() + TEMPO_POR_EMPRESA;
      let n = 0;
      for (const a of vencidas.filter((v) => v.organizacaoId === org)) {
        if (Date.now() > limite) break;
        try {
          if (await enviarAgendada(a, agora)) n++;
        } catch (e) {
          console.error(`[relógio] falha ao processar a agendada ${a.id}:`, e); // a próxima continua
        }
        await new Promise((r) => setTimeout(r, pausaMs));
      }
      return n;
    },
    (e, org) => console.error(`[relógio] falha nas agendadas da empresa ${org}:`, e),
  );
  return { enviadas: enviadas.reduce<number>((t, n) => t + (n ?? 0), 0), vistas: vencidas.length };
}

async function enviarAgendada(a: Agendada, agora: Date) {
  const reservou = await db.mensagemAgendada.updateMany({ where: { id: a.id, status: "PENDENTE" }, data: { status: "ENVIANDO" } });
  if (!reservou.count) return false;
  const { conversa, usuario } = a;
  try {
    const texto = preencherVariaveis(a.texto, {
      nome: conversa.contato?.nome ?? conversa.nome ?? conversa.cliente?.nome,
      atendente: usuario?.nome,
      empresa: conversa.organizacao.nome,
    });
    // Usuário desativado: a mensagem sai sem assinatura.
    await enviarAutomatico(conversa, texto, usuario?.ativo ? usuario : null);
    await db.mensagemAgendada.update({ where: { id: a.id }, data: { status: "ENVIADA", enviadaEm: new Date(), motivo: null } });
    return true;
  } catch (e) {
    if (e instanceof ErroLimiteEnvio) {
      // Teto do dia (conta ainda não aprovada): fica para amanhã, às 8h.
      const amanha = new Date(inicioDoDia(agora).getTime() + 32 * 3600_000);
      await db.mensagemAgendada.update({ where: { id: a.id }, data: { status: "PENDENTE", enviarEm: amanha, motivo: "adiada: limite diário de mensagens novas" } });
      return false;
    }
    const motivo = e instanceof ErroWhatsapp ? e.message : "erro inesperado no envio";
    console.error(`[relógio] não consegui enviar a agendada ${a.id}:`, e);
    await db.mensagemAgendada.update({ where: { id: a.id }, data: { status: "ERRO", motivo: motivo.slice(0, 300) } });
    return false;
  }
}

/** Garante que a Evolution API manda os avisos de cada número. Um número com problema não atrapalha os outros. */
export async function atualizarWebhooksWhatsapp(apenas?: string[]) {
  const configs = await db.configuracaoWhatsapp.findMany({
    where: { ativo: true, instancia: { not: null }, organizacao: ondeLiberada(), ...(apenas ? { organizacaoId: { in: apenas } } : {}) },
    select: { instancia: true },
  });
  const feitos = await emParalelo(
    configs,
    EMPRESAS_JUNTAS,
    async (c) => {
      await garantirWebhook(c.instancia!);
      return true;
    },
    (e, c) => console.warn(`[relógio] não consegui atualizar o webhook do WhatsApp (${c.instancia}):`, e instanceof Error ? e.message : e),
  );
  return { feitos: feitos.filter(Boolean).length, total: configs.length };
}

/** Apaga o que venceu: avisos de webhook antigos, pedidos de cadastro, convites, links e sessões. */
async function faxina() {
  const apagados = await limparEntregasAntigas();
  if (apagados) console.log(`[relógio] ${apagados} aviso(s) de webhook antigo(s) apagado(s)`);
  await limparContasVencidas();
}

const global = globalThis as unknown as { relogioCrm?: NodeJS.Timeout };

/** Repete `fn` sem deixar duas rodadas da mesma tarefa ao mesmo tempo. Um erro não para as próximas. */
function tarefa(nome: string, fn: () => Promise<void>) {
  let rodando = false;
  return async () => {
    if (rodando) return; // a rodada anterior ainda não terminou
    rodando = true;
    try {
      await fn();
    } catch (e) {
      console.error(`[relógio] ${nome}: falhou:`, e);
    } finally {
      rodando = false;
    }
  };
}

export function iniciarRelogio() {
  if (global.relogioCrm) return;
  let ultimaFaxina = 0;
  const tarefas = [
    tarefa("agendadas", async () => {
      const r = await processarAgendadas();
      if (r.vistas) console.log(`[relógio] ${r.enviadas} de ${r.vistas} mensagem(ns) agendada(s) enviada(s)`);
    }),
    // Campanhas (Fase D): no máximo uma mensagem por organização a cada rodada.
    tarefa("campanhas", async () => {
      const c = await processarCampanhas();
      if (c.enviadas) console.log(`[relógio] ${c.enviadas} mensagem(ns) de campanha enviada(s)`);
    }),
    // Webhooks de saída (Fase E): entrega os avisos para outros sistemas.
    tarefa("webhooks", async () => {
      const w = await processarWebhooks();
      if (w.vistas) console.log(`[relógio] ${w.entregues} de ${w.vistas} aviso(s) de webhook entregue(s)`);
    }),
    tarefa("faxina", async () => {
      if (Date.now() - ultimaFaxina < 3600_000) return;
      ultimaFaxina = Date.now();
      await faxina();
    }),
  ];
  const rodada = () => tarefas.forEach((t) => void t());
  global.relogioCrm = setInterval(rodada, INTERVALO);
  global.relogioCrm.unref?.();
  setTimeout(rodada, 5_000); // uma rodada logo depois de ligar
  // Garante que a Evolution API manda também os avisos de entregue/lida (campanhas),
  // em cada número de WhatsApp (um por empresa).
  atualizarWebhooksWhatsapp().catch((e) => console.warn("[relógio] não consegui atualizar os webhooks do WhatsApp:", e instanceof Error ? e.message : e));
  console.log("[relógio] automação ligada: conferindo mensagens agendadas a cada 30 s");
}
