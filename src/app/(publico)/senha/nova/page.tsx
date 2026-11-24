// Link do e-mail "nova senha": /senha/nova?codigo=...
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { conferirCodigoSenha } from "@/lib/conta";
import { definirNovaSenha } from "../actions";
import { FormularioDeSenha } from "../formularios";

export const metadata: Metadata = { title: "Nova senha", referrer: "no-referrer" };

export default function PaginaNovaSenha({ searchParams }: PageProps<"/senha/nova">) {
  return (
    <Suspense fallback={<div className="h-40" />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/senha/nova">["searchParams"] }) {
  await connection();
  const codigo = String((await searchParams).codigo ?? "");
  const usuario = await conferirCodigoSenha(codigo);
  if (!usuario) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-lg font-semibold">Link inválido ou vencido</h1>
        <p>O link para criar a senha nova tem prazo curto e funciona uma vez só.</p>
        <Link href="/senha/esqueci" className="botao w-full">Pedir outro link</Link>
      </div>
    );
  }
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Criar senha nova</h1>
      <p className="mb-4 text-sm text-slate-500">Conta: {usuario.email}</p>
      <FormularioDeSenha acao={definirNovaSenha.bind(null, codigo)} botao="Salvar senha e entrar" />
    </>
  );
}
