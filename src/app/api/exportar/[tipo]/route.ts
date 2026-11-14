// Exportação em CSV (abre no Excel e no Google Planilhas).
// GET /api/exportar/<tipo>.csv?de=aaaa-mm-dd&ate=aaaa-mm-dd
// tipos: clientes, negocios, certificados, atendentes
// O proxy não protege /api: a sessão e o papel (administrador ou gestor) são conferidos aqui.
import { connection } from "next/server";
import { db } from "@/lib/db";
import { gerarCsv } from "@/lib/csv";
import { duracao, lerPeriodo, relatorioAtendentes } from "@/lib/relatorios";
import { lerSessao } from "@/lib/sessao";

const ETAPA = { ABERTA: "Em aberto", GANHO: "Ganho", PERDIDO: "Perdido" } as const;

async function clientes(org: string) {
  const lista = await db.cliente.findMany({
    where: { organizacaoId: org },
    orderBy: { nome: "asc" },
    include: { responsavel: { select: { nome: true } }, contatos: { where: { principal: true }, take: 1 }, _count: { select: { negocios: true } } },
  });
  return gerarCsv(
    ["Nome", "Nome fantasia", "Tipo", "CNPJ/CPF", "Telefone", "WhatsApp", "E-mail", "Cidade", "UF", "Segmento", "Origem", "Contato principal", "Cargo", "Responsável", "Negócios", "Cadastrado em"],
    lista.map((c) => [
      c.nome, c.nomeFantasia, c.tipo, c.documento, c.telefone, c.whatsapp, c.email, c.cidade, c.uf, c.segmento, c.origem,
      c.contatos[0]?.nome, c.contatos[0]?.cargo, c.responsavel?.nome, c._count.negocios, c.criadoEm,
    ]),
  );
}

async function negocios(org: string) {
  const lista = await db.negocio.findMany({
    where: { organizacaoId: org },
    orderBy: { criadoEm: "desc" },
    include: { cliente: { select: { nome: true, origem: true } }, etapa: { select: { nome: true, tipo: true } }, servico: { select: { nome: true } }, responsavel: { select: { nome: true } } },
  });
  return gerarCsv(
    ["Título", "Cliente", "Curso", "Etapa", "Situação", "Valor (R$)", "Alunos", "Responsável", "Origem do cliente", "Previsão", "Fechado em", "Motivo da perda", "Criado em"],
    lista.map((n) => [
      n.titulo, n.cliente.nome, n.servico?.nome, n.etapa.nome, ETAPA[n.etapa.tipo], Number(n.valor), n.quantidadeAlunos, n.responsavel?.nome,
      n.cliente.origem, n.previsaoFechamento, n.fechadoEm, n.motivoPerda, n.criadoEm,
    ]),
  );
}

async function certificados(org: string) {
  const agora = new Date();
  const lista = await db.matricula.findMany({
    where: { turma: { organizacaoId: org }, certificadoNumero: { not: null } },
    orderBy: { certificadoNumero: "asc" },
    include: { participante: { include: { cliente: { select: { nome: true } } } }, turma: { include: { servico: { select: { nome: true, cargaHoraria: true } } } } },
  });
  return gerarCsv(
    ["Número", "Aluno", "CPF", "Cliente", "Curso", "Carga horária (h)", "Data da turma", "Emitido em", "Válido até", "Situação"],
    lista.map((m) => [
      m.certificadoNumero, m.participante.nome, m.participante.cpf, m.participante.cliente?.nome, m.turma.servico.nome, m.turma.servico.cargaHoraria,
      m.turma.dataInicio, m.emitidoEm, m.validadeAte,
      !m.validadeAte ? "sem validade" : m.validadeAte < agora ? "vencido" : "válido",
    ]),
  );
}

async function atendentes(org: string, url: URL) {
  const periodo = lerPeriodo(url.searchParams.get("de"), url.searchParams.get("ate"));
  const linhas = await relatorioAtendentes(org, periodo);
  return gerarCsv(
    ["Atendente", "Período", "Mensagens enviadas", "Conversas atendidas", "Respostas a clientes", "Tempo de resposta (mediana)", "Tempo (minutos)", "Aguardando resposta agora", "Negócios criados", "Ganhos", "Valor ganho (R$)", "Perdidos", "Registros no histórico"],
    linhas.map((l) => [
      l.nome, `${periodo.deTexto} a ${periodo.ateTexto}`, l.mensagens, l.conversas, l.respostas, duracao(l.tempoResposta),
      l.tempoResposta === null ? null : l.tempoResposta / 60_000, l.aguardando, l.negociosCriados, l.ganhos, l.valorGanho, l.perdidos, l.registros,
    ]),
  );
}

export async function GET(request: Request, ctx: RouteContext<"/api/exportar/[tipo]">) {
  await connection();
  const sessao = await lerSessao();
  if (!sessao) return new Response("Faça login.", { status: 401 });
  if (sessao.usuario.papel !== "ADMIN" && sessao.usuario.papel !== "GESTOR") return new Response("Só administrador e gestor.", { status: 403 });

  const org = sessao.usuario.organizacao.id;
  const { tipo } = await ctx.params;
  const nome = tipo.replace(/\.csv$/i, "");
  const url = new URL(request.url);
  let csv: string;
  if (nome === "clientes") csv = await clientes(org);
  else if (nome === "negocios") csv = await negocios(org);
  else if (nome === "certificados") csv = await certificados(org);
  else if (nome === "atendentes") csv = await atendentes(org, url);
  else return new Response("Exportação desconhecida.", { status: 404 });

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}-${hoje}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
