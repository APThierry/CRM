// Relatórios: por atendente, vendas e funil, turmas e certificados.
// Período na URL (?de=&ate=) e aba (?aba=). Só administrador e gestor.
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Cabecalho, Carregando, Vazio } from "@/components/ui";
import { exigirPapel } from "@/lib/auth";
import { moeda } from "@/lib/formatar";
import {
  atalhosPeriodo,
  duracao,
  lerPeriodo,
  nomeMes,
  relatorioAtendentes,
  relatorioTurmas,
  relatorioVendas,
  type Periodo,
} from "@/lib/relatorios";

export const metadata: Metadata = { title: "Relatórios" };

const ABAS = [
  { id: "atendentes", rotulo: "Por atendente" },
  { id: "vendas", rotulo: "Vendas e funil" },
  { id: "turmas", rotulo: "Turmas e certificados" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

export default function PaginaRelatorios({ searchParams }: PageProps<"/relatorios">) {
  return (
    <>
      <Cabecalho titulo="Relatórios" subtitulo="Desempenho da equipe, vendas e treinamentos no período escolhido." />
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/relatorios">["searchParams"] }) {
  await connection();
  const eu = await exigirPapel("ADMIN", "GESTOR");
  const sp = await searchParams;
  const aba: Aba = ABAS.some((a) => a.id === sp.aba) ? (sp.aba as Aba) : "atendentes";
  const periodo = lerPeriodo(sp.de, sp.ate);
  const link = (mudar: Record<string, string>) => `/relatorios?${new URLSearchParams({ aba, de: periodo.deTexto, ate: periodo.ateTexto, ...mudar })}`;

  return (
    <div className="space-y-6">
      <section className="cartao flex flex-wrap items-end gap-3 p-4">
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="aba" value={aba} />
          <div>
            <label className="rotulo" htmlFor="de">De</label>
            <input id="de" name="de" type="date" defaultValue={periodo.deTexto} className="campo w-auto" />
          </div>
          <div>
            <label className="rotulo" htmlFor="ate">Até</label>
            <input id="ate" name="ate" type="date" defaultValue={periodo.ateTexto} className="campo w-auto" />
          </div>
          <button className="botao-secundario">Ver</button>
        </form>
        <div className="flex flex-wrap gap-1">
          {atalhosPeriodo().map((a) => {
            const atual = a.de === periodo.deTexto && a.ate === periodo.ateTexto;
            return (
              <Link
                key={a.rotulo}
                href={link({ de: a.de, ate: a.ate })}
                className={`rounded-full px-3 py-1 text-xs ${atual ? "bg-marca-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                {a.rotulo}
              </Link>
            );
          })}
        </div>
        <details className="relative ml-auto">
          <summary className="botao-secundario cursor-pointer list-none">⬇ Exportar planilha</summary>
          <div className="absolute right-0 z-10 mt-1 w-64 space-y-1 rounded-md border border-slate-200 bg-white p-2 text-sm shadow-lg">
            <a className="block rounded px-2 py-1 hover:bg-slate-100" href={`/api/exportar/atendentes.csv?de=${periodo.deTexto}&ate=${periodo.ateTexto}`}>Desempenho por atendente (período)</a>
            <a className="block rounded px-2 py-1 hover:bg-slate-100" href="/api/exportar/negocios.csv">Todos os negócios</a>
            <a className="block rounded px-2 py-1 hover:bg-slate-100" href="/api/exportar/clientes.csv">Todos os clientes</a>
            <a className="block rounded px-2 py-1 hover:bg-slate-100" href="/api/exportar/certificados.csv">Todos os certificados</a>
          </div>
        </details>
      </section>

      <nav className="flex gap-1 border-b border-slate-200" aria-label="Relatórios">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={link({ aba: a.id })}
            aria-current={a.id === aba ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${a.id === aba ? "border-marca-900 font-medium text-marca-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {a.rotulo}
          </Link>
        ))}
      </nav>

      {aba === "atendentes" && <Atendentes org={eu.organizacao.id} periodo={periodo} />}
      {aba === "vendas" && <Vendas org={eu.organizacao.id} periodo={periodo} />}
      {aba === "turmas" && <Turmas org={eu.organizacao.id} periodo={periodo} />}
    </div>
  );
}

// --- Peças visuais ----------------------------------------------------------------

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="cartao p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-slate-500">{detalhe}</div>}
    </div>
  );
}

function Tabela({ titulo, colunas, linhas, nota }: { titulo: string; colunas: string[]; linhas: ReactNode[][]; nota?: ReactNode }) {
  return (
    <section className="cartao p-4">
      <h2 className="mb-3 font-semibold">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="text-sm text-slate-500">Nada no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <tr>
                {colunas.map((c, i) => (
                  <th key={c} className={`py-2 pr-3 ${i ? "text-right" : ""}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map((l, i) => (
                <tr key={i}>
                  {l.map((c, j) => (
                    <td key={j} className={`py-2 pr-3 ${j ? "text-right tabular-nums" : ""}`}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nota && <p className="mt-3 text-xs text-slate-500">{nota}</p>}
    </section>
  );
}

/** Barra horizontal proporcional, dentro de uma célula da tabela. */
function Barra({ valor, maximo, texto }: { valor: number; maximo: number; texto: ReactNode }) {
  const largura = maximo ? Math.max(2, Math.round((valor / maximo) * 100)) : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-slate-100 sm:block" aria-hidden>
        <div className="ml-auto h-full rounded-full bg-marca-700" style={{ width: `${largura}%` }} />
      </div>
      <span className="min-w-16">{texto}</span>
    </div>
  );
}

const porcento = (v: number | null) => (v === null ? "—" : `${v}%`);

// --- Abas ---------------------------------------------------------------------------

async function Atendentes({ org, periodo }: { org: string; periodo: Periodo }) {
  const linhas = await relatorioAtendentes(org, periodo);
  if (!linhas.length) return <Vazio>Nenhum movimento no período.</Vazio>;
  const maxValor = Math.max(...linhas.map((l) => l.valorGanho));
  return (
    <Tabela
      titulo="Desempenho por atendente"
      colunas={["Atendente", "Mensagens", "Conversas", "Tempo de resposta", "Aguardando agora", "Negócios criados", "Ganhos", "Valor ganho", "Perdidos", "Registros"]}
      linhas={linhas.map((l) => [
        <span key="n" className={l.ativo ? "" : "text-slate-400"}>{l.nome}{!l.ativo && " (desativado)"}</span>,
        l.mensagens,
        l.conversas,
        <span key="t" title={`${l.respostas} resposta(s) medida(s)`}>{duracao(l.tempoResposta)}</span>,
        l.aguardando ? <span key="a" className="font-medium text-amber-700">{l.aguardando}</span> : 0,
        l.negociosCriados,
        l.ganhos,
        <Barra key="v" valor={l.valorGanho} maximo={maxValor} texto={moeda(l.valorGanho)} />,
        l.perdidos,
        l.registros,
      ])}
      nota={
        <>
          <strong>Tempo de resposta</strong>: mediana do tempo entre a mensagem do cliente e a primeira resposta de uma pessoa (o valor do meio: um
          caso fora do horário não distorce). Mensagens automáticas não contam. <strong>Aguardando agora</strong>: conversas abertas cuja última
          mensagem é do cliente (não depende do período). <strong>Registros</strong>: notas, ligações e visitas lançadas no histórico.
        </>
      }
    />
  );
}

async function Vendas({ org, periodo }: { org: string; periodo: Periodo }) {
  const r = await relatorioVendas(org, periodo);
  const { resumo } = r;
  const maxEtapa = Math.max(0, ...r.funilAtual.map((e) => e.valor));
  const linhasGrupo = (g: typeof r.porCurso) => {
    const max = Math.max(0, ...g.map((x) => x.valorGanho));
    return g.map((x) => [x.nome, x.ganhos, <Barra key="v" valor={x.valorGanho} maximo={max} texto={moeda(x.valorGanho)} />, x.perdidos, porcento(x.conversao)]);
  };
  const colunasGrupo = (nome: string) => [nome, "Ganhos", "Valor ganho", "Perdidos", "Conversão"];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Numero rotulo="Vendas ganhas" valor={moeda(resumo.valorGanho)} detalhe={`${resumo.ganhos} negócio(s) · ticket médio ${resumo.ticketMedio === null ? "—" : moeda(resumo.ticketMedio)}`} />
        <Numero rotulo="Conversão" valor={porcento(resumo.conversao)} detalhe={`${resumo.ganhos} ganho(s) de ${resumo.ganhos + resumo.perdidos} fechado(s)`} />
        <Numero rotulo="Perdidos" valor={resumo.perdidos} detalhe={`${moeda(resumo.valorPerdido)} que não fecharam`} />
        <Numero
          rotulo="Novos negócios"
          valor={resumo.criados}
          detalhe={`${moeda(resumo.valorCriado)} · fechar leva ${resumo.diasParaFechar === null ? "—" : `${Math.round(resumo.diasParaFechar)} dia(s)`} (mediana)`}
        />
      </div>

      <Tabela
        titulo="Funil agora (negócios em aberto)"
        colunas={["Etapa", "Negócios", "Valor"]}
        linhas={r.funilAtual.map((e) => [
          <span key="e" className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.cor }} />{e.nome}</span>,
          e.negocios,
          <Barra key="v" valor={e.valor} maximo={maxEtapa} texto={moeda(e.valor)} />,
        ])}
        nota="Não depende do período: é a foto do funil neste momento."
      />
      {r.porMes.length > 1 && <Tabela titulo="Por mês" colunas={colunasGrupo("Mês")} linhas={linhasGrupo(r.porMes.map((m) => ({ ...m, nome: nomeMes(m.nome) })))} />}
      <div className="grid gap-6 xl:grid-cols-2">
        <Tabela titulo="Por curso" colunas={colunasGrupo("Curso")} linhas={linhasGrupo(r.porCurso)} />
        <Tabela titulo="Por origem do cliente" colunas={colunasGrupo("Origem")} linhas={linhasGrupo(r.porOrigem)} />
        <Tabela titulo="Por segmento" colunas={colunasGrupo("Segmento")} linhas={linhasGrupo(r.porSegmento)} />
        <Tabela
          titulo="Motivos de perda"
          colunas={["Motivo", "Negócios"]}
          linhas={r.motivosPerda.map((m) => [m.motivo, m.total])}
          nota={r.motivosPerda.some((m) => m.motivo === "Não informado") ? "Dica: registrar o motivo da perda ajuda a entender o que melhorar." : undefined}
        />
      </div>
    </div>
  );
}

async function Turmas({ org, periodo }: { org: string; periodo: Periodo }) {
  const r = await relatorioTurmas(org, periodo);
  const { resumo } = r;
  const maxVenc = Math.max(0, ...r.vencimentosPorMes.map((m) => m.total));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Numero rotulo="Turmas" valor={resumo.turmas} detalhe={`${resumo.realizadas} realizada(s)${resumo.canceladas ? ` · ${resumo.canceladas} cancelada(s)` : ""}`} />
        <Numero rotulo="Alunos treinados" valor={resumo.aprovados} detalhe={`${resumo.inscritos} inscrito(s) · ${resumo.faltas} falta(s)`} />
        <Numero rotulo="Aprovação" valor={porcento(resumo.aprovacao)} detalhe={`${resumo.aprovados} de ${resumo.presentes} presente(s)`} />
        <Numero rotulo="Certificados emitidos" valor={resumo.certificados} detalhe={`${resumo.vencidos} vencido(s) no total`} />
      </div>
      <Tabela
        titulo="Por curso"
        colunas={["Curso", "Turmas", "Inscritos", "Presentes", "Aprovados", "Certificados emitidos"]}
        linhas={r.porCurso.map((c) => [c.nome, c.turmas, c.alunos, c.presentes, c.aprovados, c.certificados])}
        nota="Turmas pela data de início; certificados pela data de emissão."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Tabela titulo="Clientes que mais treinaram" colunas={["Cliente", "Turmas", "Inscritos", "Aprovados"]} linhas={r.porCliente.map((c) => [c.nome, c.turmas, c.alunos, c.aprovados])} />
        <Tabela
          titulo="Certificados vencendo (próximos 12 meses)"
          colunas={["Mês", "Vencem", "Já em campanha"]}
          linhas={r.vencimentosPorMes.map((m) => [nomeMes(m.mes), <Barra key="v" valor={m.total} maximo={maxVenc} texto={m.total} />, m.jaEmCampanha])}
          nota={<>Não depende do período. Prepare os avisos de reciclagem em <Link href="/campanhas" className="underline">Campanhas</Link>.</>}
        />
      </div>
    </div>
  );
}
