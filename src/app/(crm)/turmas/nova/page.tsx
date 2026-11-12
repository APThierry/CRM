import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando } from "@/components/ui";
import { FormularioTurma } from "../formulario-turma";

export const metadata: Metadata = { title: "Nova turma" };

export default function PaginaNovaTurma({ searchParams }: PageProps<"/turmas/nova">) {
  return (
    <>
      <Cabecalho titulo="Nova turma" />
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/turmas/nova">["searchParams"] }) {
  await connection();
  const { cliente } = await searchParams; // /turmas/nova?cliente=ID já deixa o cliente escolhido
  return <FormularioTurma clienteIdInicial={typeof cliente === "string" ? cliente : undefined} />;
}
