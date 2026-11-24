import "server-only";
// Webhooks de saída: avisam outro sistema (n8n, Zapier, Make, uma planilha...)
// quando algo acontece no CRM.
//
// `dispararEvento` só grava o aviso na fila (tabela EntregaWebhook): é rápido e
// nunca atrasa nem quebra a tela de quem está usando o CRM. Quem entrega de
// verdade é o relógio (src/lib/automacao/relogio.ts), que tenta de novo com
// esperas cada vez maiores se o outro sistema estiver fora do ar.
//
// Cada entrega vai assinada: o outro sistema confere com o segredo do webhook.
//   X-CRM-Evento:     negocio.ganho
//   X-CRM-Entrega:    id da entrega (o mesmo nas novas tentativas: use para não processar duas vezes)
//   X-CRM-Timestamp:  segundos desde 1970
//   X-CRM-Assinatura: sha256=HMAC_SHA256(segredo, timestamp + "." + corpo) em hexadecimal
//
// Segurança da conexão (para onde pode apontar, DNS, tempo): ./destino.ts e ./requisicao.ts.
import { createHmac, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { LIMITES } from "@/lib/ambiente";
import { cotaPorEmpresa, emParalelo, escolherEmpresas } from "@/lib/automacao/rodizio";
import { db } from "@/lib/db";
import { ondeLiberada } from "@/lib/empresas/situacao";
import type { Evento } from "./eventos";
import { postar, type Consulta } from "./requisicao";

/** Esperas (minutos) depois de cada tentativa que falhou. Depois da última, desiste. */
export const ESPERAS_MINUTOS = [1, 5, 30, 120, 360];
export const MAX_TENTATIVAS = ESPERAS_MINUTOS.length + 1;
/** Entregas por rodada, divididas entre as empresas que têm avisos na fila. */
export const POR_RODADA = 20;
/** Avisos entregues (ou desistidos) são apagados depois destes dias. */
export const DIAS_GUARDADOS = 30;

export const novoSegredo = () => `whsec_${randomBytes(24).toString("base64url")}`;

/** Põe o evento na fila de cada webhook ativo que o assina. Nunca lança erro. */
export async function dispararEvento(organizacaoId: string, evento: Evento, dados: Prisma.InputJsonValue) {
  try {
    const webhooks = await db.webhook.findMany({
      where: { organizacaoId, ativo: true, eventos: { has: evento } },
      select: { id: true },
    });
    if (!webhooks.length) return 0;
    // Teto por empresa: um sistema fora do ar há dias não enche o banco.
    const naFila = await db.entregaWebhook.count({ where: { webhook: { organizacaoId }, status: { in: ["PENDENTE", "ENVIANDO"] } } });
    if (naFila + webhooks.length > LIMITES.avisosPendentes()) {
      console.warn(`[webhooks] fila cheia (${naFila} avisos esperando) na empresa ${organizacaoId}: evento ${evento} não registrado`);
      return 0;
    }
    await db.entregaWebhook.createMany({
      data: webhooks.map((w) => ({ webhookId: w.id, evento, payload: dados })),
    });
    return webhooks.length;
  } catch (e) {
    console.error(`[webhooks] não consegui registrar o evento ${evento}:`, e);
    return 0;
  }
}

export function assinar(segredo: string, timestamp: number, corpo: string) {
  return `sha256=${createHmac("sha256", segredo).update(`${timestamp}.${corpo}`).digest("hex")}`;
}

type Entrega = Prisma.EntregaWebhookGetPayload<{ include: { webhook: true } }>;

/**
 * Faz uma tentativa de entrega e grava o resultado. Devolve true se o outro
 * sistema aceitou (resposta 2xx). `unica`: não agenda nova tentativa (teste).
 */
export async function entregar(entrega: Entrega, agora = new Date(), unica = false, consulta?: Consulta) {
  const { webhook } = entrega;
  const corpo = JSON.stringify({ id: entrega.id, evento: entrega.evento, criadoEm: entrega.criadoEm.toISOString(), dados: entrega.payload });
  const timestamp = Math.floor(agora.getTime() / 1000);
  const tentativas = entrega.tentativas + 1;

  // Só o código da resposta interessa: o corpo nunca é lido, gravado nem mostrado.
  const resposta = await postar(webhook.url, {
    corpo,
    consulta,
    cabecalhos: {
      "Content-Type": "application/json",
      "User-Agent": "CRM-Webhooks/1.0",
      "X-CRM-Evento": entrega.evento,
      "X-CRM-Entrega": entrega.id,
      "X-CRM-Timestamp": String(timestamp),
      "X-CRM-Assinatura": assinar(webhook.segredo, timestamp, corpo),
    },
  });
  const codigo = resposta.codigo ?? null;
  const aceitou = codigo !== null && codigo >= 200 && codigo < 300;
  const redirecionou = codigo !== null && codigo >= 300 && codigo < 400;
  const erro = aceitou ? null : (resposta.erro ?? `respondeu ${codigo}${redirecionou ? " (redirecionamento não é seguido: use o endereço final)" : ""}`);

  if (!erro) {
    await db.entregaWebhook.update({
      where: { id: entrega.id },
      data: { status: "ENTREGUE", tentativas, respostaCodigo: codigo, erro: null, entregueEm: agora },
    });
    return true;
  }
  const desistiu = unica || tentativas >= MAX_TENTATIVAS;
  await db.entregaWebhook.update({
    where: { id: entrega.id },
    data: {
      status: desistiu ? "FALHOU" : "PENDENTE",
      tentativas,
      respostaCodigo: codigo,
      erro: erro.slice(0, 300),
      proximaEm: desistiu ? entrega.proximaEm : new Date(agora.getTime() + ESPERAS_MINUTOS[tentativas - 1] * 60_000),
    },
  });
  return false;
}

type OpcoesRodada = {
  /** Só estas empresas (usado pelos testes, para não tocar nas outras). */
  apenas?: string[];
  consulta?: Consulta;
};

/**
 * Chamado pelo relógio: entrega os avisos que estão na hora, em rodízio entre as
 * empresas. São sempre poucas consultas, não importa quantas empresas existam.
 */
export async function processarWebhooks(agora = new Date(), { apenas, consulta }: OpcoesRodada = {}) {
  const daEmpresa = apenas ? { organizacaoId: { in: apenas } } : {};
  // Ficou "enviando" (servidor caiu no meio)? Volta para a fila.
  await db.entregaWebhook.updateMany({
    where: { status: "ENVIANDO", proximaEm: { lt: new Date(agora.getTime() - 5 * 60_000) }, webhook: daEmpresa },
    data: { status: "PENDENTE" },
  });
  const comAvisos = await db.webhook.findMany({
    // Empresa suspensa ou com o teste vencido: os avisos esperam na fila.
    where: { ...daEmpresa, ativo: true, organizacao: ondeLiberada(agora), entregas: { some: { status: "PENDENTE", proximaEm: { lte: agora } } } },
    select: { organizacaoId: true },
  });
  const empresas = escolherEmpresas("webhooks", comAvisos.map((w) => w.organizacaoId), POR_RODADA);
  if (empresas.length === 0) return { entregues: 0, vistas: 0 };
  const cota = cotaPorEmpresa(POR_RODADA, empresas.length);

  // As primeiras `cota` entregas de cada empresa, numa consulta só.
  const escolhidas = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM (
      SELECT e.id, row_number() OVER (PARTITION BY w."organizacaoId" ORDER BY e."proximaEm", e.id) AS posicao
      FROM "EntregaWebhook" e JOIN "Webhook" w ON w.id = e."webhookId"
      WHERE e.status = 'PENDENTE' AND e."proximaEm" <= ${agora.toISOString()}::timestamp AND w.ativo AND w."organizacaoId" = ANY(${empresas})
    ) fila WHERE posicao <= ${cota} LIMIT ${POR_RODADA}`;
  const prontas = await db.entregaWebhook.findMany({ where: { id: { in: escolhidas.map((e) => e.id) } }, include: { webhook: true } });

  // Entrega em paralelo: um sistema fora do ar (10 s de espera) não segura os outros.
  const resultados = await emParalelo(
    prontas,
    POR_RODADA,
    async (e) => {
      const reservou = await db.entregaWebhook.updateMany({ where: { id: e.id, status: "PENDENTE" }, data: { status: "ENVIANDO", proximaEm: agora } });
      return reservou.count ? entregar({ ...e, proximaEm: agora }, agora, false, consulta) : false;
    },
    (erro, e) => console.error(`[webhooks] falha ao processar a entrega ${e.id}:`, erro),
  );
  return { entregues: resultados.filter(Boolean).length, vistas: prontas.length };
}

/** Apaga avisos concluídos (entregues ou desistidos) com mais de 30 dias. */
export async function limparEntregasAntigas(agora = new Date(), apenas?: string[]) {
  const r = await db.entregaWebhook.deleteMany({
    where: {
      status: { in: ["ENTREGUE", "FALHOU"] },
      criadoEm: { lt: new Date(agora.getTime() - DIAS_GUARDADOS * 86_400_000) },
      ...(apenas ? { webhook: { organizacaoId: { in: apenas } } } : {}),
    },
  });
  return r.count;
}

// --- Dados enviados em cada evento ------------------------------------------

export async function dadosNegocio(negocioId: string) {
  const n = await db.negocio.findUnique({
    where: { id: negocioId },
    include: {
      cliente: { select: { id: true, nome: true, documento: true, whatsapp: true, email: true, cidade: true } },
      etapa: { select: { id: true, nome: true, tipo: true } },
      servico: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, nome: true, email: true } },
    },
  });
  if (!n) return null;
  return {
    id: n.id,
    titulo: n.titulo,
    valor: Number(n.valor),
    quantidadeAlunos: n.quantidadeAlunos,
    previsaoFechamento: n.previsaoFechamento?.toISOString() ?? null,
    fechadoEm: n.fechadoEm?.toISOString() ?? null,
    motivoPerda: n.motivoPerda,
    etapa: n.etapa,
    curso: n.servico,
    cliente: n.cliente,
    responsavel: n.responsavel,
    criadoEm: n.criadoEm.toISOString(),
  };
}

export async function dadosCliente(clienteId: string) {
  const c = await db.cliente.findUnique({
    where: { id: clienteId },
    include: { contatos: { select: { id: true, nome: true, cargo: true, whatsapp: true, email: true, principal: true } }, responsavel: { select: { id: true, nome: true } } },
  });
  if (!c) return null;
  return {
    id: c.id,
    tipo: c.tipo,
    nome: c.nome,
    nomeFantasia: c.nomeFantasia,
    documento: c.documento,
    telefone: c.telefone,
    whatsapp: c.whatsapp,
    email: c.email,
    cidade: c.cidade,
    uf: c.uf,
    segmento: c.segmento,
    origem: c.origem,
    responsavel: c.responsavel,
    contatos: c.contatos,
    criadoEm: c.criadoEm.toISOString(),
  };
}

export async function dadosCertificado(matriculaId: string) {
  const m = await db.matricula.findUnique({
    where: { id: matriculaId },
    include: {
      participante: { select: { id: true, nome: true, cpf: true, email: true, telefone: true, cliente: { select: { id: true, nome: true } } } },
      turma: { select: { id: true, dataInicio: true, dataFim: true, local: true, servico: { select: { id: true, nome: true, cargaHoraria: true } } } },
    },
  });
  if (!m?.certificadoNumero) return null;
  return {
    matriculaId: m.id,
    numero: m.certificadoNumero,
    emitidoEm: m.emitidoEm?.toISOString() ?? null,
    validadeAte: m.validadeAte?.toISOString() ?? null,
    aluno: { id: m.participante.id, nome: m.participante.nome, cpf: m.participante.cpf, email: m.participante.email, telefone: m.participante.telefone },
    cliente: m.participante.cliente,
    curso: m.turma.servico,
    turma: { id: m.turma.id, dataInicio: m.turma.dataInicio.toISOString(), dataFim: m.turma.dataFim?.toISOString() ?? null, local: m.turma.local },
  };
}

/**
 * Atalho: se algum webhook assina o evento, busca os dados e dispara (não faz
 * nada se o registro sumiu). Sem webhook cadastrado, custa uma consulta só.
 */
export async function dispararComDados(organizacaoId: string, evento: Evento, buscar: () => Promise<Prisma.InputJsonValue | null>) {
  try {
    const algum = await db.webhook.count({ where: { organizacaoId, ativo: true, eventos: { has: evento } } });
    if (!algum) return;
    const dados = await buscar();
    if (dados) await dispararEvento(organizacaoId, evento, dados);
  } catch (e) {
    console.error(`[webhooks] não consegui montar o evento ${evento}:`, e);
  }
}
