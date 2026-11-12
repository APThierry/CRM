// Certificado para imprimir ou salvar em PDF (A4 deitado).
// ATENÇÃO: o texto é um modelo. Confira com a Brigada MG o que o certificado
// precisa conter (conteúdo programático, responsável técnico, registro no CBMMG).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { Carregando } from "@/components/ui";
import { db } from "@/lib/db";
import { cpf, data } from "@/lib/formatar";
import { getOrganizacaoAtual } from "@/lib/org";

export const metadata: Metadata = { title: "Certificado" };

export default function PaginaCertificado({ params }: PageProps<"/certificados/[id]">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Certificado params={params} />
    </Suspense>
  );
}

async function Certificado({ params }: { params: PageProps<"/certificados/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const org = await getOrganizacaoAtual();

  const m = await db.matricula.findFirst({
    where: { id, aprovado: true, certificadoNumero: { not: null }, turma: { organizacaoId: org.id } },
    include: { participante: { include: { cliente: true } }, turma: { include: { servico: true, instrutor: true } } },
  });
  if (!m) notFound();

  const { turma, participante } = m;
  const periodo =
    turma.dataFim && data(turma.dataFim) !== data(turma.dataInicio)
      ? `de ${data(turma.dataInicio)} a ${data(turma.dataFim)}`
      : `em ${data(turma.dataInicio)}`;

  return (
    <div>
      {/* @page define o tamanho da folha na impressão */}
      <style>{`@page { size: A4 landscape; margin: 0; }`}</style>

      <div className="mb-4 flex gap-2 print:hidden">
        <BotaoImprimir />
        <Link href={`/turmas/${turma.id}`} className="botao-secundario">Voltar para a turma</Link>
      </div>

      <article className="mx-auto flex aspect-[297/210] w-full max-w-[1100px] flex-col border-[10px] border-double border-marca-700 bg-white p-[5%] text-center text-slate-800 print:max-w-none print:border-[12px]">
        <header>
          <div className="text-2xl font-bold tracking-wide text-marca-700">{org.nome}</div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Treinamentos em Segurança</div>
        </header>

        <div className="flex flex-1 flex-col justify-center">
          <h1 className="text-5xl font-bold tracking-[0.2em] text-slate-900">CERTIFICADO</h1>
          <p className="mx-auto mt-8 max-w-3xl text-lg leading-relaxed">
            Certificamos que <strong className="text-xl">{participante.nome}</strong>
            {participante.cpf && <>, CPF {cpf(participante.cpf)}</>}
            {participante.cliente && <>, colaborador(a) de {participante.cliente.nome}</>}, concluiu com aproveitamento o
            treinamento <strong>{turma.servico.nome}</strong>
            {turma.servico.cargaHoraria && <>, com carga horária de {turma.servico.cargaHoraria} horas</>}, realizado {periodo}
            {turma.local && <>, em {turma.local}</>}.
          </p>
          {m.validadeAte && (
            <p className="mt-4 text-sm text-slate-600">Este certificado é válido até <strong>{data(m.validadeAte)}</strong>.</p>
          )}
        </div>

        <footer className="grid grid-cols-3 items-end gap-8 text-sm">
          <div>
            <div className="border-t border-slate-400 pt-1">{turma.instrutor?.nome ?? "Instrutor"}</div>
            <div className="text-xs text-slate-500">Instrutor</div>
          </div>
          <div className="text-xs text-slate-500">
            Nº <span className="font-mono">{m.certificadoNumero}</span>
            <br />
            Emitido em {data(m.emitidoEm)}
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1">&nbsp;</div>
            <div className="text-xs text-slate-500">Responsável técnico</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
