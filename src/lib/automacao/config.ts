import "server-only";
// Configuração da automação de cada empresa (uma linha por organização).
// Na primeira vez é criada com os textos padrão e tudo DESLIGADO.
import { db } from "@/lib/db";
import { lerHorarios } from "./horario";
import { AUTOMACAO_PADRAO, OPCOES_BOT_PADRAO } from "./padroes";

export async function obterAutomacao(organizacaoId: string) {
  const existente = await db.configuracaoAutomacao.findUnique({ where: { organizacaoId } });
  const config = existente ?? (await criarPadrao(organizacaoId));
  return { ...config, horarios: lerHorarios(config.horarios) };
}

/** Só lê (não cria). Usado no webhook: sem configuração = nada ligado. */
export async function lerAutomacao(organizacaoId: string) {
  const config = await db.configuracaoAutomacao.findUnique({ where: { organizacaoId } });
  return config ? { ...config, horarios: lerHorarios(config.horarios) } : null;
}

async function criarPadrao(organizacaoId: string) {
  const etiquetas = await db.etiqueta.findMany({ where: { organizacaoId }, select: { id: true, nome: true } });
  const etiquetaId = (nome: string | null) => etiquetas.find((e) => e.nome === nome)?.id ?? null;
  return db.$transaction(async (tx) => {
    // Outra requisição pode ter criado ao mesmo tempo.
    const ja = await tx.configuracaoAutomacao.findUnique({ where: { organizacaoId } });
    if (ja) return ja;
    if ((await tx.opcaoBot.count({ where: { organizacaoId } })) === 0) {
      await tx.opcaoBot.createMany({
        data: OPCOES_BOT_PADRAO.map((o, i) => ({
          organizacaoId,
          ordem: i + 1,
          rotulo: o.rotulo,
          resposta: o.resposta,
          etiquetaId: etiquetaId(o.etiqueta),
        })),
      });
    }
    return tx.configuracaoAutomacao.create({
      data: {
        organizacaoId,
        horarios: AUTOMACAO_PADRAO.horarios,
        mensagemForaHorario: AUTOMACAO_PADRAO.mensagemForaHorario,
        botBoasVindas: AUTOMACAO_PADRAO.botBoasVindas,
        botReativarHoras: AUTOMACAO_PADRAO.botReativarHoras,
      },
    });
  });
}

/** Texto do menu: boas-vindas + "*1* - Orçamento" ... */
export function textoDoMenu(cabecalho: string, opcoes: { ordem: number; rotulo: string }[]) {
  return [cabecalho.trim(), "", ...opcoes.map((o) => `*${o.ordem}* - ${o.rotulo}`)].join("\n");
}
