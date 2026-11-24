// Link do e-mail de confirmação: /confirmar?codigo=...
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { conferirCodigo } from "@/lib/conta";
import { BotaoConfirmar } from "./botao";

export const metadata: Metadata = { title: "Confirmar e-mail" };

export default function PaginaConfirmar({ searchParams }: PageProps<"/confirmar">) {
  return (
    <Suspense fallback={<div className="h-32" />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/confirmar">["searchParams"] }) {
  await connection();
  const codigo = String((await searchParams).codigo ?? "");
  const usuario = await conferirCodigo(codigo, "CONFIRMAR_EMAIL");
  if (!usuario) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-lg font-semibold">Link inválido ou vencido</h1>
        <p>O link de confirmação vale por 48 horas e funciona uma vez só. Tente entrar com seu e-mail e senha: se a conta ainda não estiver confirmada, enviamos um link novo.</p>
        <Link href="/login" className="botao-secundario w-full">Ir para a tela de entrada</Link>
      </div>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold">Confirmar e-mail</h1>
      <p>
        Olá, {usuario.nome.split(" ")[0]}! Clique abaixo para confirmar <strong>{usuario.email}</strong> e entrar na conta da{" "}
        <strong>{usuario.organizacao.nome}</strong>.
      </p>
      <BotaoConfirmar codigo={codigo} />
    </div>
  );
}
