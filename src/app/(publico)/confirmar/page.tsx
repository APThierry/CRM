// Link do e-mail de cadastro: /confirmar?codigo=...
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { conferirCadastro } from "@/lib/conta";
import { FormularioDeSenha } from "../senha/formularios";
import { confirmarCadastro } from "./actions";

export const metadata: Metadata = { title: "Confirmar e-mail", referrer: "no-referrer" };

export default function PaginaConfirmar({ searchParams }: PageProps<"/confirmar">) {
  return (
    <Suspense fallback={<div className="h-40" />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/confirmar">["searchParams"] }) {
  await connection();
  const codigo = String((await searchParams).codigo ?? "");
  const pedido = await conferirCadastro(codigo);
  if (!pedido) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-lg font-semibold">Link inválido ou vencido</h1>
        <p>O link de confirmação vale por 48 horas e funciona uma vez só. Se você já confirmou, é só entrar. Se não, faça o cadastro de novo.</p>
        <Link href="/cadastro" className="botao w-full">Fazer o cadastro de novo</Link>
        <Link href="/login" className="botao-secundario w-full">Ir para a tela de entrada</Link>
      </div>
    );
  }
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Confirmar e-mail</h1>
      <p className="mb-4 text-sm text-slate-600">
        Olá, {pedido.nome.split(" ")[0]}! Escolha a sua senha para confirmar <strong>{pedido.email}</strong> e criar a conta da <strong>{pedido.empresa}</strong>.
        Se você não pediu este cadastro, feche esta página.
      </p>
      <FormularioDeSenha acao={confirmarCadastro.bind(null, codigo)} botao="Criar a conta e entrar" />
    </>
  );
}
