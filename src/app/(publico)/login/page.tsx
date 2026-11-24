// Tela de entrada. Numa instalação nova (ninguém tem senha), mostra o "primeiro acesso".
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { cadastroAberto } from "@/lib/cadastro";
import { lerSessao } from "@/lib/sessao";
import { primeiroAcessoLiberado } from "./actions";
import { FormularioLogin, FormularioPrimeiroAcesso } from "./formularios";

export const metadata: Metadata = { title: "Entrar" };

export default function PaginaLogin() {
  return (
    <Suspense fallback={<div className="h-48" />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  await connection();
  if (await lerSessao()) redirect("/");

  if (await primeiroAcessoLiberado()) {
    return (
      <>
        <h1 className="mb-1 text-lg font-semibold">Primeiro acesso</h1>
        <p className="mb-4 text-sm text-slate-500">Crie a conta do administrador. Depois ele cadastra os outros usuários.</p>
        <FormularioPrimeiroAcesso />
      </>
    );
  }

  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Entrar</h1>
      <FormularioLogin />
      <div className="mt-4 space-y-2 text-center text-sm">
        <p>
          <Link href="/senha/esqueci" className="text-marca-700 hover:underline">Esqueci minha senha</Link>
        </p>
        {cadastroAberto() && (
          <p className="text-slate-500">
            Ainda não tem conta? <Link href="/cadastro" className="font-medium text-marca-700 hover:underline">Criar conta grátis</Link>
          </p>
        )}
      </div>
    </>
  );
}
