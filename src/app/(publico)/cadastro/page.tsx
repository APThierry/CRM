// Página pública "Criar conta" (Fase F2).
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { cadastroAberto, diasDeTeste } from "@/lib/cadastro";
import { lerSessao } from "@/lib/sessao";
import { FormularioCadastro } from "./formulario";

export const metadata: Metadata = { title: "Criar conta" };

export default function PaginaCadastro() {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  await connection();
  if (await lerSessao()) redirect("/");
  if (!cadastroAberto()) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-lg font-semibold">Cadastro fechado</h1>
        <p>No momento não estamos abrindo contas novas.</p>
        <Link href="/login" className="botao-secundario w-full">Ir para a tela de entrada</Link>
      </div>
    );
  }
  return <FormularioCadastro diasTeste={diasDeTeste()} />;
}
