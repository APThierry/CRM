// Tela de entrada. Numa instalação nova (ninguém tem senha), mostra o "primeiro acesso".
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { cadastroAberto } from "@/lib/cadastro";
import { primeiroAcesso } from "@/lib/primeiro-acesso";
import { lerSessao } from "@/lib/sessao";
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

  const liberado = await primeiroAcesso();
  if (liberado && !liberado.exigeCodigo) {
    return (
      <>
        <h1 className="mb-1 text-lg font-semibold">Primeiro acesso</h1>
        <p className="mb-4 text-sm text-slate-500">Crie a conta do administrador. Depois ele cadastra os outros usuários.</p>
        <FormularioPrimeiroAcesso exigeCodigo={false} />
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
      {/* Em produção: só com o SETUP_TOKEN. Fica junto do login, porque outras empresas já podem estar usando o CRM. */}
      {liberado && (
        <details className="mt-6 rounded-md border border-slate-200 p-3 text-sm">
          <summary className="cursor-pointer text-slate-600">Primeiro acesso (quem instalou o sistema)</summary>
          <div className="mt-3">
            <FormularioPrimeiroAcesso exigeCodigo />
          </div>
        </details>
      )}
    </>
  );
}
