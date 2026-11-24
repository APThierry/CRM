// Link do e-mail de convite: /convite?codigo=...
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { nomesPapel } from "@/lib/auth";
import { conferirConvite } from "@/lib/conta";
import { FormularioDeSenha } from "../senha/formularios";
import { entrarComConvite } from "./actions";

export const metadata: Metadata = { title: "Convite", referrer: "no-referrer" };

export default function PaginaConvite({ searchParams }: PageProps<"/convite">) {
  return (
    <Suspense fallback={<div className="h-40" />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/convite">["searchParams"] }) {
  await connection();
  const codigo = String((await searchParams).codigo ?? "");
  const convite = await conferirConvite(codigo);
  if (!convite) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-lg font-semibold">Convite inválido ou vencido</h1>
        <p>O convite vale por 3 dias e funciona uma vez só. Se você já aceitou, é só entrar. Se não, peça outro a quem convidou você.</p>
        <Link href="/login" className="botao-secundario w-full">Ir para a tela de entrada</Link>
      </div>
    );
  }
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Aceitar o convite</h1>
      <p className="mb-4 text-sm text-slate-600">
        Olá, {convite.nome.split(" ")[0]}! A empresa <strong>{convite.organizacao.nome}</strong> convidou <strong>{convite.email}</strong> para entrar como{" "}
        <strong>{nomesPapel[convite.papel]}</strong>. Escolha a sua senha para aceitar.
      </p>
      <FormularioDeSenha acao={entrarComConvite.bind(null, codigo)} botao="Aceitar e entrar" />
    </>
  );
}
