import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando, Etiqueta, Vazio } from "@/components/ui";
import { db } from "@/lib/db";
import { data } from "@/lib/formatar";
import { getOrganizacaoAtual } from "@/lib/org";
import { modalidade, statusTurma } from "./rotulos";

export const metadata: Metadata = { title: "Turmas" };

export default function PaginaTurmas() {
  return (
    <>
      <Cabecalho
        titulo="Turmas"
        subtitulo="Agenda de treinamentos"
        acoes={<Link href="/turmas/nova" className="botao">+ Nova turma</Link>}
      />
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
    include: {
      servico: true,
      cliente: true,
      instrutor: true,
      _count: { select: { matriculas: true } },
      matriculas: { where: { aprovado: true }, select: { id: true } },
    },
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
            <th className="px-4 py-3 text-center">Aprovados</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {turmas.map((t) => (
            <tr key={t.id} className="hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-3">{data(t.dataInicio)}</td>
              <td className="px-4 py-3">
                <Link href={`/turmas/${t.id}`} className="font-medium hover:underline">{t.servico.nome}</Link>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {t.cliente ? <div>{t.cliente.nome}</div> : <div className="text-slate-400">Turma aberta</div>}
                <div className="text-xs text-slate-400">{t.local}</div>
              </td>
              <td className="px-4 py-3">{modalidade[t.modalidade]}</td>
              <td className="px-4 py-3 text-slate-600">{t.instrutor?.nome ?? "—"}</td>
              <td className="px-4 py-3 text-center">{t._count.matriculas}/{t.vagas ?? "—"}</td>
              <td className="px-4 py-3 text-center">{t.matriculas.length}</td>
              <td className="px-4 py-3"><Etiqueta cor={statusTurma[t.status].cor}>{statusTurma[t.status].rotulo}</Etiqueta></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
