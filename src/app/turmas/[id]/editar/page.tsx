import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando } from "@/components/ui";
import { db } from "@/lib/db";
import { getOrganizacaoAtual } from "@/lib/org";
import { FormularioTurma } from "../../formulario-turma";

export const metadata: Metadata = { title: "Editar turma" };

export default function PaginaEditarTurma({ params }: PageProps<"/turmas/[id]/editar">) {
  return (
    <>
      <Cabecalho titulo="Editar turma" />
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </>
  );
}

async function Conteudo({ params }: { params: PageProps<"/turmas/[id]/editar">["params"] }) {
  await connection();
  const { id } = await params;
  const org = await getOrganizacaoAtual();
  const turma = await db.turma.findFirst({ where: { id, organizacaoId: org.id } });
  if (!turma) notFound();
  return <FormularioTurma turma={turma} />;
}
