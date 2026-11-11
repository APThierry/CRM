import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando, Etiqueta, Vazio } from "@/components/ui";
import { db } from "@/lib/db";
import { data } from "@/lib/formatar";
import { getOrganizacaoAtual } from "@/lib/org";

export const metadata: Metadata = { title: "Turmas" };

const status: Record<string, { rotulo: string; cor: string }> = {
  PLANEJADA: { rotulo: "Planejada", cor: "#64748b" },
  CONFIRMADA: { rotulo: "Confirmada", cor: "#0284c7" },
  REALIZADA: { rotulo: "Realizada", cor: "#16a34a" },
  CANCELADA: { rotulo: "Cancelada", cor: "#dc2626" },
};
const modalidade: Record<string, string> = { PRESENCIAL: "Presencial", EAD: "EAD", HIBRIDO: "Híbrido" };

export default function PaginaTurmas() {
  return (
    <>
      <Cabecalho titulo="Turmas" subtitulo="Agenda de treinamentos" />
      <Suspense fallback={<Carregando />}>
        <ListaTurmas />
      </Suspense>
    </>
  );
}

async function ListaTurmas() {
  await connection();
  const org = await getOrganizacaoAtual();
  const turmas = await db.turma.findMany({
    where: { organizacaoId: org.id },
    include: { servico: true, cliente: true, instrutor: true, _count: { select: { matriculas: true } } },
    orderBy: { dataInicio: "desc" },
  });

  if (turmas.length === 0) return <Vazio>Nenhuma turma cadastrada.</Vazio>;

  return (
    <div className="cartao overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Data</th>
            <th className="px-4 py-3">Curso</th>
            <th className="px-4 py-3">Cliente / Local</th>
            <th className="px-4 py-3">Modalidade</th>
            <th className="px-4 py-3">Instrutor</th>
            <th className="px-4 py-3 text-center">Alunos</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {turmas.map((t) => (
            <tr key={t.id}>
              <td className="whitespace-nowrap px-4 py-3">{data(t.dataInicio)}</td>
              <td className="px-4 py-3 font-medium">{t.servico.nome}</td>
              <td className="px-4 py-3 text-slate-600">
                {t.cliente ? <div>{t.cliente.nome}</div> : <div className="text-slate-400">Turma aberta</div>}
                <div className="text-xs text-slate-400">{t.local}</div>
              </td>
              <td className="px-4 py-3">{modalidade[t.modalidade]}</td>
              <td className="px-4 py-3 text-slate-600">{t.instrutor?.nome ?? "—"}</td>
              <td className="px-4 py-3 text-center">{t._count.matriculas}/{t.vagas ?? "—"}</td>
              <td className="px-4 py-3"><Etiqueta cor={status[t.status].cor}>{status[t.status].rotulo}</Etiqueta></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
