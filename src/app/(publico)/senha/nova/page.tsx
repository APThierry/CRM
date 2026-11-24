// Link do e-mail "nova senha": /senha/nova?codigo=...
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { conferirCodigo } from "@/lib/conta";
import { FormularioNovaSenha } from "../formularios";

export const metadata: Metadata = { title: "Nova senha" };

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
  const usuario = await conferirCodigo(codigo, "NOVA_SENHA");
  if (!usuario) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-lg font-semibold">Link inválido ou vencido</h1>
        <p>O link para criar a senha nova vale por 1 hora e funciona uma vez só.</p>
        <Link href="/senha/esqueci" className="botao w-full">Pedir outro link</Link>
      </div>
    );
  }
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Criar senha nova</h1>
      <p className="mb-4 text-sm text-slate-500">Conta: {usuario.email}</p>
      <FormularioNovaSenha codigo={codigo} />
    </>
  );
}
