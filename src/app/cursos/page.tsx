import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando } from "@/components/ui";
import { db } from "@/lib/db";
import { moeda } from "@/lib/formatar";
import { getOrganizacaoAtual } from "@/lib/org";

export const metadata: Metadata = { title: "Cursos" };

export default function PaginaCursos() {
  return (
    <>
      <Cabecalho titulo="Cursos" subtitulo="Treinamentos oferecidos, com carga horária e validade do certificado" />
      <Suspense fallback={<Carregando />}>
        <ListaCursos />
      </Suspense>
    </>
  );
}

async function ListaCursos() {
  await connection();
  const org = await getOrganizacaoAtual();
  const cursos = await db.servico.findMany({
    where: { organizacaoId: org.id },
    include: { _count: { select: { turmas: true, negocios: true } } },
    orderBy: { nome: "asc" },
  });

  return (
    <div className="cartao overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Curso</th>
            <th className="px-4 py-3 text-right">Carga horária</th>
            <th className="px-4 py-3 text-right">Validade</th>
            <th className="px-4 py-3 text-right">Preço</th>
            <th className="px-4 py-3 text-center">Turmas</th>
            <th className="px-4 py-3 text-center">Negócios</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cursos.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3 font-medium">{c.nome}</td>
              <td className="px-4 py-3 text-right">{c.cargaHoraria ? `${c.cargaHoraria}h` : "—"}</td>
              <td className="px-4 py-3 text-right">{c.validadeMeses ? `${c.validadeMeses} meses` : "—"}</td>
              <td className="px-4 py-3 text-right">{c.preco ? moeda(c.preco) : "—"}</td>
              <td className="px-4 py-3 text-center">{c._count.turmas}</td>
              <td className="px-4 py-3 text-center">{c._count.negocios}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
        Carga horária e validade são valores de referência. Confira com a coordenação antes de usar nos certificados.
      </p>
    </div>
  );
}
