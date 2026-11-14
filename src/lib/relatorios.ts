import "server-only";
// Cálculos dos relatórios (tela Relatórios e exportação CSV).
// Todos recebem a organização e o período [de, ate]. Datas no fuso de Brasília.
import { db } from "@/lib/db";

const FUSO = "-03:00"; // Brasília (sem horário de verão desde 2019)

export type Periodo = { de: Date; ate: Date; deTexto: string; ateTexto: string };

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const valida = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Lê ?de=aaaa-mm-dd&ate=aaaa-mm-dd. Padrão: do dia 1º do mês até hoje. */
export function lerPeriodo(de: unknown, ate: unknown, agora = new Date()): Periodo {
  const hoje = ymd(agora);
  let deTexto = valida(de) ? de : `${hoje.slice(0, 8)}01`;
  let ateTexto = valida(ate) ? ate : hoje;
  if (deTexto > ateTexto) [deTexto, ateTexto] = [ateTexto, deTexto];
  return {
    de: new Date(`${deTexto}T00:00:00${FUSO}`),
    ate: new Date(`${ateTexto}T23:59:59.999${FUSO}`),
    deTexto,
    ateTexto,
  };
}

/** Atalhos de período para os botões da tela. */
export function atalhosPeriodo(agora = new Date()) {
  const hoje = ymd(agora);
  const [a, m] = hoje.split("-").map(Number);
  const mesPassado = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  const fimMesPassado = ymd(new Date(new Date(`${hoje.slice(0, 8)}01T12:00:00${FUSO}`).getTime() - 86_400_000));
  return [
    { rotulo: "Este mês", de: `${hoje.slice(0, 8)}01`, ate: hoje },
    { rotulo: "Mês passado", de: `${mesPassado}-01`, ate: fimMesPassado },
    { rotulo: "Últimos 90 dias", de: ymd(new Date(agora.getTime() - 89 * 86_400_000)), ate: hoje },
    { rotulo: "Este ano", de: `${a}-01-01`, ate: hoje },
  ];
}

export function mediana(valores: number[]) {
  if (!valores.length) return null;
  const v = [...valores].sort((x, y) => x - y);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/** 95 min -> "1 h 35 min" */
export function duracao(ms: number | null) {
  if (ms === null) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
  return `${Math.round(h / 24)} dias`;
}

const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : null);

// --- Por atendente ------------------------------------------------------------

export type LinhaAtendente = {
  usuarioId: string | null;
  nome: string;
  ativo: boolean;
  mensagens: number;
  conversas: number;
  respostas: number;
  /** Mediana do tempo entre a mensagem do cliente e a primeira resposta da pessoa. */
  tempoResposta: number | null;
  aguardando: number;
  negociosCriados: number;
  ganhos: number;
  valorGanho: number;
  perdidos: number;
  registros: number;
};

/**
 * Tempo de resposta: dentro de cada conversa, quando o cliente escreve (e ainda
 * não tinha mensagem dele esperando) começa a contar; para na primeira resposta
 * de uma pessoa (pelo CRM ou pelo celular da empresa). Mensagens automáticas
 * (chatbot, follow-up, campanha) não contam como resposta.
 */
export function temposDeResposta(
  mensagens: { conversaId: string; direcao: "ENTRADA" | "SAIDA"; usuarioId: string | null; status: string | null; criadoEm: Date }[],
) {
  const porPessoa = new Map<string | null, number[]>(); // null = celular da empresa
  let conversa = "";
  let esperandoDesde: Date | null = null;
  for (const m of mensagens) {
    if (m.conversaId !== conversa) {
      conversa = m.conversaId;
      esperandoDesde = null;
    }
    if (m.direcao === "ENTRADA") {
      esperandoDesde ??= m.criadoEm;
      continue;
    }
    const humana = m.usuarioId !== null || m.status === "enviada pelo celular";
    if (!humana || !esperandoDesde) continue;
    const lista = porPessoa.get(m.usuarioId) ?? [];
    lista.push(m.criadoEm.getTime() - esperandoDesde.getTime());
    porPessoa.set(m.usuarioId, lista);
    esperandoDesde = null;
  }
  return porPessoa;
}

export async function relatorioAtendentes(organizacaoId: string, p: Periodo): Promise<LinhaAtendente[]> {
  const noPeriodo = { gte: p.de, lte: p.ate };
  const [usuarios, enviadas, porConversa, mensagens, aguardando, criados, fechados, registros] = await Promise.all([
    db.usuario.findMany({ where: { organizacaoId }, select: { id: true, nome: true, ativo: true }, orderBy: { nome: "asc" } }),
    db.mensagemWhatsapp.groupBy({ by: ["usuarioId"], where: { organizacaoId, direcao: "SAIDA", usuarioId: { not: null }, criadoEm: noPeriodo }, _count: true }),
    db.mensagemWhatsapp.groupBy({ by: ["usuarioId", "conversaId"], where: { organizacaoId, direcao: "SAIDA", usuarioId: { not: null }, criadoEm: noPeriodo } }),
    db.mensagemWhatsapp.findMany({
      where: { organizacaoId, criadoEm: noPeriodo },
      select: { conversaId: true, direcao: true, usuarioId: true, status: true, criadoEm: true },
      orderBy: [{ conversaId: "asc" }, { criadoEm: "asc" }],
      take: 100_000,
    }),
    // Agora (não depende do período): conversas abertas cuja última mensagem é do cliente.
    db.conversa.groupBy({ by: ["atendenteId"], where: { organizacaoId, status: "ABERTA", ultimaDirecao: "ENTRADA" }, _count: true }),
    db.negocio.groupBy({ by: ["responsavelId"], where: { organizacaoId, criadoEm: noPeriodo }, _count: true }),
    db.negocio.findMany({
      where: { organizacaoId, fechadoEm: noPeriodo, etapa: { tipo: { in: ["GANHO", "PERDIDO"] } } },
      select: { responsavelId: true, valor: true, etapa: { select: { tipo: true } } },
    }),
    db.atividade.groupBy({ by: ["usuarioId"], where: { organizacaoId, criadoEm: noPeriodo, tipo: { not: "TAREFA" } }, _count: true }),
  ]);
  const tempos = temposDeResposta(mensagens);
  const linha = (usuarioId: string | null, nome: string, ativo: boolean): LinhaAtendente => {
    const meusFechados = fechados.filter((n) => n.responsavelId === usuarioId);
    const ganhos = meusFechados.filter((n) => n.etapa.tipo === "GANHO");
    const t = tempos.get(usuarioId) ?? [];
    return {
      usuarioId,
      nome,
      ativo,
      mensagens: enviadas.find((e) => e.usuarioId === usuarioId)?._count ?? 0,
      conversas: porConversa.filter((c) => c.usuarioId === usuarioId).length,
      respostas: t.length,
      tempoResposta: mediana(t),
      aguardando: aguardando.find((a) => a.atendenteId === usuarioId)?._count ?? 0,
      negociosCriados: criados.find((c) => c.responsavelId === usuarioId)?._count ?? 0,
      ganhos: ganhos.length,
      valorGanho: ganhos.reduce((s, n) => s + Number(n.valor), 0),
      perdidos: meusFechados.length - ganhos.length,
      registros: registros.find((r) => r.usuarioId === usuarioId)?._count ?? 0,
    };
  };
  const linhas = usuarios.map((u) => linha(u.id, u.nome, u.ativo));
  // Respostas pelo celular da empresa (fora do CRM) e conversas na fila.
  const celular = linha(null, "Fila / celular da empresa", true);
  celular.mensagens = 0;
  celular.conversas = 0;
  celular.negociosCriados = 0;
  celular.ganhos = 0;
  celular.valorGanho = 0;
  celular.perdidos = 0;
  celular.registros = 0;
  const comMovimento = linhas.filter((l) => l.ativo || l.mensagens || l.respostas || l.negociosCriados || l.ganhos || l.perdidos || l.registros);
  return celular.respostas || celular.aguardando ? [...comMovimento, celular] : comMovimento;
}

// --- Vendas e funil -------------------------------------------------------------

type Grupo = { nome: string; ganhos: number; valorGanho: number; perdidos: number; conversao: number | null };

function agrupar<T>(itens: T[], chave: (i: T) => string, ganho: (i: T) => boolean, valor: (i: T) => number): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const i of itens) {
    const k = chave(i);
    const g = mapa.get(k) ?? { nome: k, ganhos: 0, valorGanho: 0, perdidos: 0, conversao: null };
    if (ganho(i)) {
      g.ganhos++;
      g.valorGanho += valor(i);
    } else g.perdidos++;
    mapa.set(k, g);
  }
  return [...mapa.values()]
    .map((g) => ({ ...g, conversao: pct(g.ganhos, g.ganhos + g.perdidos) }))
    .sort((a, b) => b.valorGanho - a.valorGanho || b.ganhos - a.ganhos);
}

export async function relatorioVendas(organizacaoId: string, p: Periodo) {
  const noPeriodo = { gte: p.de, lte: p.ate };
  const [fechados, criados, etapas, abertos] = await Promise.all([
    db.negocio.findMany({
      where: { organizacaoId, fechadoEm: noPeriodo, etapa: { tipo: { in: ["GANHO", "PERDIDO"] } } },
      select: {
        valor: true,
        fechadoEm: true,
        criadoEm: true,
        motivoPerda: true,
        etapa: { select: { tipo: true } },
        servico: { select: { nome: true } },
        cliente: { select: { origem: true, segmento: true } },
      },
    }),
    db.negocio.aggregate({ where: { organizacaoId, criadoEm: noPeriodo }, _count: true, _sum: { valor: true } }),
    db.etapaFunil.findMany({ where: { organizacaoId, tipo: "ABERTA" }, orderBy: { ordem: "asc" }, select: { id: true, nome: true, cor: true } }),
    db.negocio.groupBy({ by: ["etapaId"], where: { organizacaoId, etapa: { tipo: "ABERTA" } }, _count: true, _sum: { valor: true } }),
  ]);
  const ganho = (n: (typeof fechados)[number]) => n.etapa.tipo === "GANHO";
  const valor = (n: (typeof fechados)[number]) => Number(n.valor);
  const ganhos = fechados.filter(ganho);
  const perdidos = fechados.filter((n) => !ganho(n));
  const valorGanho = ganhos.reduce((s, n) => s + valor(n), 0);
  // Math.max: negócio lançado depois de fechado (cadastro atrasado) conta como 0 dia.
  const diasParaFechar = mediana(ganhos.map((n) => Math.max(0, (n.fechadoEm!.getTime() - n.criadoEm.getTime()) / 86_400_000)));

  const motivos = new Map<string, number>();
  for (const n of perdidos) {
    const m = n.motivoPerda?.trim() || "Não informado";
    motivos.set(m, (motivos.get(m) ?? 0) + 1);
  }

  return {
    resumo: {
      ganhos: ganhos.length,
      valorGanho,
      ticketMedio: ganhos.length ? valorGanho / ganhos.length : null,
      perdidos: perdidos.length,
      valorPerdido: perdidos.reduce((s, n) => s + valor(n), 0),
      conversao: pct(ganhos.length, fechados.length),
      diasParaFechar,
      criados: criados._count,
      valorCriado: Number(criados._sum.valor ?? 0),
    },
    porMes: agrupar(fechados, (n) => ymd(n.fechadoEm!).slice(0, 7), ganho, valor).sort((a, b) => a.nome.localeCompare(b.nome)),
    porCurso: agrupar(fechados, (n) => n.servico?.nome ?? "Sem curso", ganho, valor),
    porOrigem: agrupar(fechados, (n) => n.cliente.origem?.trim() || "Não informada", ganho, valor),
    porSegmento: agrupar(fechados, (n) => n.cliente.segmento?.trim() || "Não informado", ganho, valor),
    motivosPerda: [...motivos.entries()].map(([motivo, total]) => ({ motivo, total })).sort((a, b) => b.total - a.total),
    funilAtual: etapas.map((e) => {
      const g = abertos.find((a) => a.etapaId === e.id);
      return { ...e, negocios: g?._count ?? 0, valor: Number(g?._sum.valor ?? 0) };
    }),
  };
}

// --- Turmas e certificados ----------------------------------------------------------

export async function relatorioTurmas(organizacaoId: string, p: Periodo, agora = new Date()) {
  const noPeriodo = { gte: p.de, lte: p.ate };
  const daqui12Meses = new Date(agora.getTime() + 365 * 86_400_000);
  const [turmas, emitidos, vencendo, vencidos] = await Promise.all([
    db.turma.findMany({
      where: { organizacaoId, dataInicio: noPeriodo },
      select: {
        status: true,
        servico: { select: { nome: true } },
        cliente: { select: { nome: true } },
        matriculas: { select: { presente: true, aprovado: true } },
      },
    }),
    db.matricula.findMany({
      where: { turma: { organizacaoId }, certificadoNumero: { not: null }, emitidoEm: noPeriodo },
      select: { turma: { select: { servico: { select: { nome: true } } } } },
    }),
    db.matricula.findMany({
      where: { turma: { organizacaoId }, aprovado: true, validadeAte: { gte: agora, lte: daqui12Meses } },
      select: { validadeAte: true, reciclagemEm: true },
    }),
    db.matricula.count({ where: { turma: { organizacaoId }, aprovado: true, validadeAte: { lt: agora } } }),
  ]);

  const validas = turmas.filter((t) => t.status !== "CANCELADA");
  const todas = validas.flatMap((t) => t.matriculas);
  const presentes = todas.filter((m) => m.presente === true).length;
  const aprovados = todas.filter((m) => m.aprovado === true).length;

  const porCurso = new Map<string, { nome: string; turmas: number; alunos: number; presentes: number; aprovados: number; certificados: number }>();
  const curso = (nome: string) => porCurso.get(nome) ?? { nome, turmas: 0, alunos: 0, presentes: 0, aprovados: 0, certificados: 0 };
  for (const t of validas) {
    const c = curso(t.servico.nome);
    c.turmas++;
    c.alunos += t.matriculas.length;
    c.presentes += t.matriculas.filter((m) => m.presente === true).length;
    c.aprovados += t.matriculas.filter((m) => m.aprovado === true).length;
    porCurso.set(c.nome, c);
  }
  for (const m of emitidos) {
    const c = curso(m.turma.servico.nome);
    c.certificados++;
    porCurso.set(c.nome, c);
  }

  const porCliente = new Map<string, { nome: string; turmas: number; alunos: number; aprovados: number }>();
  for (const t of validas) {
    const nome = t.cliente?.nome ?? "Turmas abertas (vários clientes)";
    const c = porCliente.get(nome) ?? { nome, turmas: 0, alunos: 0, aprovados: 0 };
    c.turmas++;
    c.alunos += t.matriculas.length;
    c.aprovados += t.matriculas.filter((m) => m.aprovado === true).length;
    porCliente.set(nome, c);
  }

  const meses = new Map<string, { mes: string; total: number; jaEmCampanha: number }>();
  for (const m of vencendo) {
    const mes = ymd(m.validadeAte!).slice(0, 7);
    const g = meses.get(mes) ?? { mes, total: 0, jaEmCampanha: 0 };
    g.total++;
    if (m.reciclagemEm) g.jaEmCampanha++;
    meses.set(mes, g);
  }

  return {
    resumo: {
      turmas: validas.length,
      realizadas: validas.filter((t) => t.status === "REALIZADA").length,
      canceladas: turmas.length - validas.length,
      inscritos: todas.length,
      presentes,
      aprovados,
      faltas: todas.filter((m) => m.presente === false).length,
      aprovacao: pct(aprovados, presentes),
      certificados: emitidos.length,
      vencendo12Meses: vencendo.length,
      vencidos,
    },
    porCurso: [...porCurso.values()].sort((a, b) => b.alunos - a.alunos),
    porCliente: [...porCliente.values()].sort((a, b) => b.alunos - a.alunos).slice(0, 15),
    vencimentosPorMes: [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
  };
}

/** "2026-11" -> "nov/2026" */
export function nomeMes(aaaamm: string) {
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [a, m] = aaaamm.split("-");
  return `${nomes[Number(m) - 1]}/${a}`;
}
