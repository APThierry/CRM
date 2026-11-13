import "server-only";
// Reciclagem (Fase D): o CRM monta a lista de clientes com certificados vencendo;
// o gestor revisa e prepara a campanha. Ao preparar, o CRM:
// - cria um negócio de reciclagem no funil para cada curso de cada cliente;
// - registra uma nota no histórico do cliente;
// - monta a campanha (RASCUNHO) com uma mensagem por cliente;
// - marca os certificados como avisados (não entram de novo na lista).
// Nada é enviado até o gestor clicar em Iniciar na campanha.
import type { UsuarioAtual } from "@/lib/auth";
import { obterAutomacao } from "@/lib/automacao/config";
import { db } from "@/lib/db";
import { data } from "@/lib/formatar";
import { montarPublico } from "./publico";

const DIA = 86_400_000;
/** Certificados vencidos há até 30 dias ainda entram (dá tempo de recuperar o cliente). */
const VENCIDOS_ATE_DIAS = 30;

export type GrupoReciclagem = {
  clienteId: string;
  cliente: string;
  responsavelId: string | null;
  vence: Date;
  cursos: { servicoId: string; nome: string; quantidade: number; vence: Date; preco: number | null }[];
  matriculaIds: string[];
};

/** Clientes com certificados que vencem nos próximos `dias` (e ainda não avisados). */
export async function listarReciclagens(organizacaoId: string, dias: number, agora = new Date()): Promise<GrupoReciclagem[]> {
  const matriculas = await db.matricula.findMany({
    where: {
      aprovado: true,
      reciclagemEm: null,
      validadeAte: { gte: new Date(agora.getTime() - VENCIDOS_ATE_DIAS * DIA), lte: new Date(agora.getTime() + dias * DIA) },
      turma: { organizacaoId },
      participante: { clienteId: { not: null } },
    },
    select: {
      id: true,
      validadeAte: true,
      participante: { select: { cliente: { select: { id: true, nome: true, responsavelId: true } } } },
      turma: { select: { servico: { select: { id: true, nome: true, preco: true } } } },
    },
    orderBy: { validadeAte: "asc" },
  });

  const grupos = new Map<string, GrupoReciclagem>();
  for (const m of matriculas) {
    const cli = m.participante.cliente!;
    const vence = m.validadeAte!;
    const servico = m.turma.servico;
    let g = grupos.get(cli.id);
    if (!g) {
      g = { clienteId: cli.id, cliente: cli.nome, responsavelId: cli.responsavelId, vence, cursos: [], matriculaIds: [] };
      grupos.set(cli.id, g);
    }
    g.matriculaIds.push(m.id);
    if (vence < g.vence) g.vence = vence;
    const curso = g.cursos.find((c) => c.servicoId === servico.id);
    if (curso) {
      curso.quantidade++;
      if (vence < curso.vence) curso.vence = vence;
    } else {
      g.cursos.push({ servicoId: servico.id, nome: servico.nome, quantidade: 1, vence, preco: servico.preco ? Number(servico.preco) : null });
    }
  }
  return [...grupos.values()].sort((a, b) => a.vence.getTime() - b.vence.getTime());
}

const alunos = (n: number) => `${n} aluno${n > 1 ? "s" : ""}`;

/** "NR 23 / IT 12 (4 alunos) e NR 35 (2 alunos)" — para a variável {curso}. */
export function descreverCursos(cursos: GrupoReciclagem["cursos"]) {
  const partes = cursos.map((c) => `${c.nome} (${alunos(c.quantidade)})`);
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}` : (partes[0] ?? "");
}

export async function prepararReciclagem(eu: UsuarioAtual) {
  const org = eu.organizacao.id;
  const config = await obterAutomacao(org);
  const grupos = await listarReciclagens(org, config.reciclagemDias);
  if (grupos.length === 0) return null;

  const [etapa, publico] = await Promise.all([
    db.etapaFunil.findFirst({ where: { organizacaoId: org, tipo: "ABERTA" }, orderBy: { ordem: "asc" } }),
    montarPublico(org, { clienteIds: grupos.map((g) => g.clienteId) }),
  ]);
  if (!etapa) throw new Error("O funil não tem nenhuma etapa aberta.");
  const contatoDe = new Map(publico.map((p) => [p.clienteId, p]));
  const agora = new Date();

  return db.$transaction(async (tx) => {
    const campanha = await tx.campanha.create({
      data: {
        organizacaoId: org,
        nome: `Reciclagem ${data(agora)}`,
        tipo: "RECICLAGEM",
        texto: config.reciclagemTexto,
        filtro: { reciclagemDias: config.reciclagemDias },
        criadoPorId: eu.id,
      },
    });

    let ordem = 0;
    let negocios = 0;
    const semEnvio: string[] = [];
    for (const g of grupos) {
      let primeiroNegocio: string | null = null;
      for (const c of g.cursos) {
        const n = await tx.negocio.create({
          data: {
            organizacaoId: org,
            titulo: `Reciclagem ${c.nome} (${alunos(c.quantidade)})`,
            clienteId: g.clienteId,
            etapaId: etapa.id,
            servicoId: c.servicoId,
            responsavelId: g.responsavelId,
            quantidadeAlunos: c.quantidade,
            valor: c.preco ? c.preco * c.quantidade : 0,
            previsaoFechamento: c.vence,
          },
        });
        primeiroNegocio ??= n.id;
        negocios++;
      }
      await tx.atividade.create({
        data: {
          organizacaoId: org,
          tipo: "NOTA",
          clienteId: g.clienteId,
          usuarioId: eu.id,
          descricao: `Reciclagem: certificados de ${descreverCursos(g.cursos)} vencem a partir de ${data(g.vence)}. Negócio criado no funil.`,
        },
      });

      const p = contatoDe.get(g.clienteId);
      if (p && !p.fora && p.telefone && p.chave) {
        await tx.destinatarioCampanha.create({
          data: {
            campanhaId: campanha.id,
            clienteId: g.clienteId,
            contatoId: p.contatoId,
            negocioId: primeiroNegocio,
            nome: p.nome,
            telefone: p.telefone,
            chave: p.chave,
            ordem: ordem++,
            variaveis: { curso: descreverCursos(g.cursos), vencimento: data(g.vence), cliente: g.cliente },
          },
        });
      } else {
        semEnvio.push(`${g.cliente} (${p?.fora ?? "sem WhatsApp"})`);
      }
    }

    await tx.matricula.updateMany({ where: { id: { in: grupos.flatMap((g) => g.matriculaIds) } }, data: { reciclagemEm: agora } });
    return { campanhaId: campanha.id, clientes: grupos.length, negocios, destinatarios: ordem, semEnvio };
  });
}
