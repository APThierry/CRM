// Painel: números principais, tarefas do dia e certificados vencendo.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando, Vazio } from "@/components/ui";
import { db } from "@/lib/db";
import { data, moeda } from "@/lib/formatar";
import { getOrganizacaoAtual } from "@/lib/org";

export default function PaginaPainel() {
  return (
    <>
      <Cabecalho titulo="Painel" subtitulo="Visão geral das vendas, turmas e reciclagens" />
      <Suspense fallback={<Carregando />}>
        <ConteudoPainel />
      </Suspense>
    </>
  );
}

async function ConteudoPainel() {
  await connection(); // dados sempre atualizados, buscados a cada acesso
  const org = await getOrganizacaoAtual();
  const organizacaoId = org.id;

  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const daqui60dias = new Date(hoje.getTime() + 60 * 24 * 60 * 60 * 1000);
  const fimDeHoje = new Date(hoje);
  fimDeHoje.setHours(23, 59, 59, 999);

  const [abertos, ganhosMes, totalClientes, proximasTurmas, tarefas, vencendo] = await Promise.all([
    db.negocio.aggregate({ where: { organizacaoId, etapa: { tipo: "ABERTA" } }, _sum: { valor: true }, _count: true }),
    db.negocio.aggregate({
      where: { organizacaoId, etapa: { tipo: "GANHO" }, fechadoEm: { gte: inicioMes } },
      _sum: { valor: true },
      _count: true,
    }),
    db.cliente.count({ where: { organizacaoId } }),
    db.turma.findMany({
      where: { organizacaoId, dataInicio: { gte: hoje }, status: { not: "CANCELADA" } },
      include: { servico: true, _count: { select: { matriculas: true } } },
      orderBy: { dataInicio: "asc" },
      take: 5,
    }),
    db.atividade.findMany({
      where: { organizacaoId, concluida: false, agendadaPara: { lte: fimDeHoje } },
      include: { cliente: true },
      orderBy: { agendadaPara: "asc" },
      take: 8,
    }),
    // Reciclagem: certificados que vencem nos próximos 60 dias, agrupados por cliente.
    db.matricula.findMany({
      where: { turma: { organizacaoId }, validadeAte: { gte: hoje, lte: daqui60dias } },
      include: { participante: { include: { cliente: true } }, turma: { include: { servico: true } } },
      orderBy: { validadeAte: "asc" },
    }),
  ]);

  const reciclagens = new Map<string, { cliente: string; clienteId?: string; curso: string; quantidade: number; vence: Date }>();
  for (const m of vencendo) {
    const cli = m.participante.cliente;
    const chave = `${cli?.id ?? "sem"}-${m.turma.servicoId}`;
    const atual = reciclagens.get(chave);
    if (atual) atual.quantidade++;
    else
      reciclagens.set(chave, {
        cliente: cli?.nome ?? "Sem cliente",
        clienteId: cli?.id,
        curso: m.turma.servico.nome,
        quantidade: 1,
        vence: m.validadeAte!,
      });
  }

  const indicadores = [
    { rotulo: "Valor no funil", valor: moeda(abertos._sum.valor), detalhe: `${abertos._count} negócios abertos` },
    { rotulo: "Vendido no mês", valor: moeda(ganhosMes._sum.valor), detalhe: `${ganhosMes._count} negócios fechados` },
    { rotulo: "Clientes", valor: String(totalClientes), detalhe: "cadastrados" },
    { rotulo: "Certificados vencendo", valor: String(vencendo.length), detalhe: "nos próximos 60 dias" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {indicadores.map((i) => (
          <div key={i.rotulo} className="cartao p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{i.rotulo}</div>
            <div className="mt-2 text-2xl font-semibold">{i.valor}</div>
            <div className="mt-1 text-xs text-slate-500">{i.detalhe}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="cartao p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">🔁 Reciclagens a oferecer</h2>
            <Link href="/certificados?situacao=vencendo" className="text-xs text-marca-700 hover:underline">ver certificados</Link>
          </div>
          {reciclagens.size === 0 ? (
            <Vazio>Nenhum certificado vencendo nos próximos 60 dias.</Vazio>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...reciclagens.values()].map((r) => (
                <li key={`${r.clienteId}-${r.curso}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    {r.clienteId ? (
                      <Link href={`/clientes/${r.clienteId}`} className="font-medium hover:underline">{r.cliente}</Link>
                    ) : (
                      <span className="font-medium">{r.cliente}</span>
                    )}
                    <div className="text-xs text-slate-500">{r.curso} · {r.quantidade} certificado(s)</div>
                  </div>
                  <span className="whitespace-nowrap text-xs font-medium text-amber-700">vence {data(r.vence)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cartao p-4">
          <h2 className="mb-3 font-semibold">✔ Tarefas de hoje e atrasadas</h2>
          {tarefas.length === 0 ? (
            <Vazio>Nenhuma tarefa pendente.</Vazio>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tarefas.map((t) => (
                <li key={t.id} className="py-2 text-sm">
                  <div>{t.descricao}</div>
                  <div className="text-xs text-slate-500">
                    {data(t.agendadaPara)}
                    {t.cliente && (
                      <>
                        {" · "}
                        <Link href={`/clientes/${t.cliente.id}`} className="hover:underline">{t.cliente.nome}</Link>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cartao p-4 lg:col-span-2">
          <h2 className="mb-3 font-semibold">📅 Próximas turmas</h2>
          {proximasTurmas.length === 0 ? (
            <Vazio>Nenhuma turma agendada.</Vazio>
          ) : (
            <ul className="divide-y divide-slate-100">
              {proximasTurmas.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <Link href={`/turmas/${t.id}`} className="font-medium hover:underline">{t.servico.nome}</Link>
                    <div className="text-xs text-slate-500">{t.local}</div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div className="font-medium text-slate-700">{data(t.dataInicio)}</div>
                    {t._count.matriculas}/{t.vagas ?? "—"} inscritos
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
