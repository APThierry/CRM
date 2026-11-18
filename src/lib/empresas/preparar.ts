// O que toda empresa nova recebe pronto: funil, etiquetas, respostas rápidas,
// automação (tudo desligado) e o nome da instância do WhatsApp.
//
// Sem "server-only" e com imports relativos, para o seed (prisma/seed.ts) e os
// scripts também poderem usar. Recebe o cliente do banco (ou uma transação).
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { AUTOMACAO_PADRAO, OPCOES_BOT_PADRAO } from "../automacao/padroes";
import { ETIQUETAS_PADRAO, RESPOSTAS_PADRAO } from "../padroes-atendimento";

type Banco = PrismaClient | Prisma.TransactionClient;

export type EtapaInicial = { nome: string; cor: string; tipo?: "ABERTA" | "GANHO" | "PERDIDO" };

/** Funil para qualquer negócio. Cada empresa ajusta depois. */
export const ETAPAS_PADRAO: EtapaInicial[] = [
  { nome: "Novo contato", cor: "#64748b" },
  { nome: "Qualificação", cor: "#0ea5e9" },
  { nome: "Proposta enviada", cor: "#f59e0b" },
  { nome: "Negociação", cor: "#f97316" },
  { nome: "Ganho", cor: "#16a34a", tipo: "GANHO" },
  { nome: "Perdido", cor: "#dc2626", tipo: "PERDIDO" },
];

/** Nome da instância na Evolution API. Um número de WhatsApp por empresa. */
export const nomeInstancia = (slug: string) => `crm-${slug}`;

/** "Clínica São José Ltda." -> "clinica-sao-jose-ltda" */
export function gerarSlug(nome: string) {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base || "empresa";
}

/** Slug que ainda não existe: "clinica", "clinica-2", "clinica-3"... */
export async function slugLivre(db: Banco, nome: string) {
  const base = gerarSlug(nome);
  const usados = new Set(
    (await db.organizacao.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((o) => o.slug),
  );
  if (!usados.has(base)) return base;
  for (let i = 2; ; i++) if (!usados.has(`${base}-${i}`)) return `${base}-${i}`;
}

/**
 * Cria o básico de uma empresa que acabou de nascer. Só cria o que ainda não
 * existe, então pode ser chamada de novo sem duplicar nada.
 */
export async function prepararEmpresa(db: Banco, org: { id: string; slug: string }, etapas: EtapaInicial[] = ETAPAS_PADRAO) {
  const organizacaoId = org.id;

  if ((await db.etapaFunil.count({ where: { organizacaoId } })) === 0) {
    await db.etapaFunil.createMany({ data: etapas.map((e, ordem) => ({ ...e, ordem, organizacaoId })) });
  }
  if ((await db.etiqueta.count({ where: { organizacaoId } })) === 0) {
    await db.etiqueta.createMany({ data: ETIQUETAS_PADRAO.map((e) => ({ ...e, organizacaoId })) });
  }
  if ((await db.respostaRapida.count({ where: { organizacaoId } })) === 0) {
    await db.respostaRapida.createMany({ data: RESPOSTAS_PADRAO.map((r) => ({ ...r, organizacaoId })) });
  }
  if (!(await db.configuracaoAutomacao.findUnique({ where: { organizacaoId } }))) {
    const etiquetas = await db.etiqueta.findMany({ where: { organizacaoId }, select: { id: true, nome: true } });
    if ((await db.opcaoBot.count({ where: { organizacaoId } })) === 0) {
      await db.opcaoBot.createMany({
        data: OPCOES_BOT_PADRAO.map((o, i) => ({
          organizacaoId,
          ordem: i + 1,
          rotulo: o.rotulo,
          resposta: o.resposta,
          etiquetaId: etiquetas.find((e) => e.nome === o.etiqueta)?.id ?? null,
        })),
      });
    }
    await db.configuracaoAutomacao.create({
      data: {
        organizacaoId,
        horarios: AUTOMACAO_PADRAO.horarios,
        mensagemForaHorario: AUTOMACAO_PADRAO.mensagemForaHorario,
        botBoasVindas: AUTOMACAO_PADRAO.botBoasVindas,
        botReativarHoras: AUTOMACAO_PADRAO.botReativarHoras,
      },
    });
  }
  // A instância fica reservada desde já; a conexão (QR Code) é feita na tela WhatsApp.
  await db.configuracaoWhatsapp.upsert({
    where: { organizacaoId },
    create: { organizacaoId, provedor: "EVOLUTION", instancia: nomeInstancia(org.slug), ativo: false },
    update: {},
  });
}
