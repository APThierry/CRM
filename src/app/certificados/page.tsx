// Todos os certificados emitidos, com filtro por situação e busca.
// "Vencendo" (próximos 60 dias) é a lista de reciclagens para oferecer.
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando, Etiqueta, Vazio } from "@/components/ui";
import { situacaoCertificado, type SituacaoCertificado } from "@/lib/certificados";
import { db } from "@/lib/db";
import { cpf, data } from "@/lib/formatar";
import { getOrganizacaoAtual } from "@/lib/org";
import { situacao } from "../turmas/rotulos";

export const metadata: Metadata = { title: "Certificados" };

const filtros: { valor: SituacaoCertificado | "todos"; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "vencendo", rotulo: "Vencendo (60 dias)" },
  { valor: "vencido", rotulo: "Vencidos" },
  { valor: "valido", rotulo: "Válidos" },
];

export default function PaginaCertificados({ searchParams }: PageProps<"/certificados">) {
  return (
    <>
      <Cabecalho titulo="Certificados" subtitulo="Certificados emitidos e reciclagens a oferecer" />
      <Suspense fallback={<Carregando />}>
        <Lista searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Lista({ searchParams }: { searchParams: PageProps<"/certificados">["searchParams"] }) {
  await connection();
  const { situacao: filtroBruto, q } = await searchParams;
  const filtro = filtros.find((f) => f.valor === filtroBruto)?.valor ?? "todos";
  const busca = typeof q === "string" ? q.trim() : "";
  const org = await getOrganizacaoAtual();

  const matriculas = await db.matricula.findMany({
    where: {
      aprovado: true,
      certificadoNumero: { not: null },
      turma: { organizacaoId: org.id },
      ...(busca && {
        OR: [
          { participante: { nome: { contains: busca, mode: "insensitive" } } },
          { participante: { cpf: { contains: busca.replace(/\D/g, "") || busca } } },
          { participante: { cliente: { nome: { contains: busca, mode: "insensitive" } } } },
          { certificadoNumero: { contains: busca, mode: "insensitive" } },
        ],
      }),
    },
    include: { participante: { include: { cliente: true } }, turma: { include: { servico: true } } },
    orderBy: { validadeAte: "asc" },
  });

  const hoje = new Date();
  const comSituacao = matriculas.map((m) => ({ ...m, sit: situacaoCertificado(m.validadeAte, hoje) }));
  const contagem = (v: string) => (v === "todos" ? comSituacao.length : comSituacao.filter((m) => m.sit === v).length);
  const lista = filtro === "todos" ? comSituacao : comSituacao.filter((m) => m.sit === filtro);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {filtros.map((f) => (
          <Link
            key={f.valor}
            href={{ pathname: "/certificados", query: { ...(f.valor !== "todos" && { situacao: f.valor }), ...(busca && { q: busca }) } }}
            className={`rounded-full border px-3 py-1 text-sm ${filtro === f.valor ? "border-marca-600 bg-marca-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {f.rotulo} <span className="opacity-70">({contagem(f.valor)})</span>
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          {filtro !== "todos" && <input type="hidden" name="situacao" value={filtro} />}
          <input name="q" defaultValue={busca} placeholder="Aluno, CPF, empresa ou nº" className="campo w-64" />
          <button className="botao-secundario">Buscar</button>
        </form>
      </div>

      {lista.length === 0 ? (
        <Vazio>Nenhum certificado encontrado.</Vazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Aluno</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Curso</th>
                <th className="px-4 py-3">Nº</th>
                <th className="px-4 py-3">Validade</th>
                <th className="px-4 py-3">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{m.participante.nome}</div>
                    {m.participante.cpf && <div className="text-xs text-slate-500">{cpf(m.participante.cpf)}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {m.participante.cliente ? (
                      <Link href={`/clientes/${m.participante.cliente.id}`} className="hover:underline">{m.participante.cliente.nome}</Link>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/turmas/${m.turmaId}`} className="hover:underline">{m.turma.servico.nome}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/certificados/${m.id}`} target="_blank" className="font-mono text-xs text-marca-700 hover:underline">{m.certificadoNumero}</Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{data(m.validadeAte)}</td>
                  <td className="px-4 py-3"><Etiqueta cor={situacao[m.sit].cor}>{situacao[m.sit].rotulo}</Etiqueta></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
