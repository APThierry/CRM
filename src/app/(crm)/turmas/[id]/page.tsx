// Página da turma: dados, inscrição de alunos, presença, aprovação e certificados.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando, Etiqueta, Vazio } from "@/components/ui";
import { calcularValidade, situacaoCertificado } from "@/lib/certificados";
import { db } from "@/lib/db";
import { cpf, data } from "@/lib/formatar";
import { getOrganizacaoAtual } from "@/lib/org";
import type { StatusTurma } from "@/generated/prisma/client";
import {
  alterarStatusTurma,
  concluirTurma,
  definirResultado,
  inscreverParticipante,
  marcarPresenca,
  removerInscricao,
} from "../actions";
import { modalidade, situacao, statusTurma } from "../rotulos";

export const metadata: Metadata = { title: "Turma" };

export default function PaginaTurma({ params }: PageProps<"/turmas/[id]">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Turma params={params} />
    </Suspense>
  );
}

// Botão pequeno que chama uma Server Action (funciona mesmo sem JavaScript).
function BotaoAcao({ acao, children, ativo, cor = "slate" }: { acao: () => Promise<void>; children: React.ReactNode; ativo?: boolean; cor?: "green" | "red" | "slate" }) {
  const cores = {
    green: ativo ? "border-green-600 bg-green-600 text-white" : "border-slate-300 text-slate-600 hover:border-green-600 hover:text-green-700",
    red: ativo ? "border-red-600 bg-red-600 text-white" : "border-slate-300 text-slate-600 hover:border-red-600 hover:text-red-700",
    slate: "border-slate-300 text-slate-600 hover:bg-slate-50",
  };
  return (
    <form action={acao}>
      <button className={`rounded border px-2 py-1 text-xs font-medium ${cores[cor]}`}>{children}</button>
    </form>
  );
}

async function Turma({ params }: { params: PageProps<"/turmas/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const org = await getOrganizacaoAtual();

  const [turma, clientes] = await Promise.all([
    db.turma.findFirst({
      where: { id, organizacaoId: org.id },
      include: {
        servico: true,
        cliente: true,
        instrutor: true,
        matriculas: { include: { participante: { include: { cliente: true } } }, orderBy: { participante: { nome: "asc" } } },
      },
    }),
    db.cliente.findMany({ where: { organizacaoId: org.id }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);
  if (!turma) notFound();

  const total = turma.matriculas.length;
  const presentes = turma.matriculas.filter((m) => m.presente).length;
  const aprovados = turma.matriculas.filter((m) => m.aprovado).length;
  const pendentes = turma.matriculas.filter((m) => m.presente && m.aprovado === null).length;
  const lotada = turma.vagas !== null && total >= turma.vagas;
  const validadePrevista = calcularValidade(turma, turma.servico.validadeMeses);
  const st = statusTurma[turma.status];

  return (
    <>
      <Cabecalho
        titulo={turma.servico.nome}
        subtitulo={`${data(turma.dataInicio)}${turma.dataFim ? ` a ${data(turma.dataFim)}` : ""} · ${modalidade[turma.modalidade]}${turma.local ? ` · ${turma.local}` : ""}`}
        acoes={
          <>
            <Link href={`/turmas/${turma.id}/editar`} className="botao-secundario">Editar</Link>
            <Link href="/turmas" className="botao-secundario">Voltar</Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <section className="cartao p-4 text-sm">
            <h2 className="mb-3 font-semibold">Dados da turma</h2>
            <dl className="space-y-2">
              {[
                ["Status", <Etiqueta key="s" cor={st.cor}>{st.rotulo}</Etiqueta>],
                ["Cliente", turma.cliente ? <Link key="c" href={`/clientes/${turma.cliente.id}`} className="hover:underline">{turma.cliente.nome}</Link> : "Turma aberta"],
                ["Instrutor", turma.instrutor?.nome ?? "—"],
                ["Carga horária", turma.servico.cargaHoraria ? `${turma.servico.cargaHoraria}h` : "—"],
                ["Vagas", turma.vagas ? `${total}/${turma.vagas}${lotada ? " (lotada)" : ""}` : total],
                ["Certificado válido até", validadePrevista ? data(validadePrevista) : "não vence"],
              ].map(([rotulo, valor]) => (
                <div key={String(rotulo)} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{rotulo}</dt>
                  <dd className="text-right">{valor}</dd>
                </div>
              ))}
            </dl>
            {turma.observacoes && <p className="mt-3 rounded bg-slate-50 p-2 text-slate-600">{turma.observacoes}</p>}
          </section>

          <section className="cartao p-4 text-sm">
            <h2 className="mb-3 font-semibold">Mudar status</h2>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(statusTurma) as StatusTurma[])
                .filter((s) => s !== turma.status)
                .map((s) => (
                  <BotaoAcao key={s} acao={alterarStatusTurma.bind(null, turma.id, s)}>{statusTurma[s].rotulo}</BotaoAcao>
                ))}
            </div>
          </section>

          <section className="cartao p-4 text-sm">
            <h2 className="mb-1 font-semibold">Resumo</h2>
            <p className="text-slate-600">{total} inscritos · {presentes} presentes · {aprovados} aprovados</p>
            {pendentes > 0 && (
              <form action={concluirTurma.bind(null, turma.id)} className="mt-3">
                <button className="botao w-full">✔ Aprovar {pendentes} presente(s) e concluir turma</button>
                <p className="mt-2 text-xs text-slate-500">Emite os certificados de quem está marcado como presente e ainda não tem resultado.</p>
              </form>
            )}
          </section>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <section className="cartao p-4 text-sm">
            <h2 className="mb-3 font-semibold">Inscrever aluno</h2>
            <form action={inscreverParticipante.bind(null, turma.id)} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_150px_150px_auto]">
              <input name="nome" required placeholder="Nome completo *" className="campo" aria-label="Nome completo" />
              <input name="cpf" placeholder="CPF" className="campo" aria-label="CPF" />
              <input name="telefone" placeholder="Telefone" className="campo" aria-label="Telefone" />
              <button className="botao">Inscrever</button>
              {!turma.clienteId && (
                <select name="clienteId" className="campo sm:col-span-2 lg:col-span-4" aria-label="Empresa do aluno" defaultValue="">
                  <option value="">Empresa do aluno (opcional)</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              )}
            </form>
            {lotada && <p className="mt-2 text-xs font-medium text-amber-700">Atenção: a turma já atingiu o número de vagas.</p>}
            <p className="mt-2 text-xs text-slate-500">Se o CPF já estiver cadastrado, o CRM reaproveita o aluno e mantém o histórico dele.</p>
          </section>

          <section className="cartao text-sm">
            <h2 className="p-4 pb-0 font-semibold">Alunos ({total})</h2>
            {total === 0 ? (
              <div className="p-4"><Vazio>Nenhum aluno inscrito ainda.</Vazio></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="mt-3 w-full">
                  <thead className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Aluno</th>
                      <th className="px-4 py-2">Presença</th>
                      <th className="px-4 py-2">Resultado</th>
                      <th className="px-4 py-2">Certificado</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {turma.matriculas.map((m) => {
                      const sit = situacao[situacaoCertificado(m.validadeAte)];
                      return (
                        <tr key={m.id}>
                          <td className="px-4 py-2">
                            <div className="font-medium">{m.participante.nome}</div>
                            <div className="text-xs text-slate-500">
                              {m.participante.cpf ? cpf(m.participante.cpf) : "sem CPF"}
                              {m.participante.cliente && !turma.clienteId ? ` · ${m.participante.cliente.nome}` : ""}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex gap-1">
                              <BotaoAcao cor="green" ativo={m.presente === true} acao={marcarPresenca.bind(null, m.id, m.presente === true ? null : true)}>Presente</BotaoAcao>
                              <BotaoAcao cor="red" ativo={m.presente === false} acao={marcarPresenca.bind(null, m.id, m.presente === false ? null : false)}>Faltou</BotaoAcao>
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex gap-1">
                              <BotaoAcao cor="green" ativo={m.aprovado === true} acao={definirResultado.bind(null, m.id, m.aprovado === true ? null : true)}>Aprovado</BotaoAcao>
                              <BotaoAcao cor="red" ativo={m.aprovado === false} acao={definirResultado.bind(null, m.id, m.aprovado === false ? null : false)}>Reprovado</BotaoAcao>
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            {m.aprovado && m.certificadoNumero ? (
                              <div>
                                <Link href={`/certificados/${m.id}`} target="_blank" className="font-mono text-xs text-marca-700 hover:underline">
                                  🖨 {m.certificadoNumero}
                                </Link>
                                <div className="mt-0.5 text-xs">
                                  <Etiqueta cor={sit.cor}>{sit.rotulo}</Etiqueta>
                                  {m.validadeAte && <span className="ml-1 text-slate-500">até {data(m.validadeAte)}</span>}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {!m.certificadoNumero && (
                              <BotaoAcao acao={removerInscricao.bind(null, m.id)}>Remover</BotaoAcao>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
