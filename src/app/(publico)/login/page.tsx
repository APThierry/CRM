// Tela de entrada. Se ninguém tem senha ainda, mostra o "primeiro acesso".
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { lerSessao } from "@/lib/sessao";
import { primeiroAcessoLiberado } from "./actions";
import { FormularioLogin, FormularioPrimeiroAcesso } from "./formularios";

export const metadata: Metadata = { title: "Entrar" };

export default function PaginaLogin() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-marca-900 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold tracking-tight text-marca-700">Brigada MG</div>
          <div className="text-sm text-slate-500">CRM</div>
        </div>
        <Suspense fallback={<div className="h-48" />}>
          <Conteudo />
        </Suspense>
      </div>
    </div>
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
      <p className="mt-4 text-center text-xs text-slate-500">Esqueceu a senha? Peça ao administrador para redefinir.</p>
    </>
  );
}
