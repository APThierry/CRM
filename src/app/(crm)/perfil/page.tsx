import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando } from "@/components/ui";
import { getUsuarioAtual, nomesPapel } from "@/lib/auth";
import { db } from "@/lib/db";
import { FormPerfil, FormTrocarSenha } from "../usuarios/formularios";
import { LinkAgenda } from "./agenda";

export const metadata: Metadata = { title: "Meu perfil" };

export default function PaginaPerfil() {
  return (
    <>
      <Cabecalho titulo="Meu perfil" />
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </>
  );
}

async function Conteudo() {
  await connection();
  const eu = await getUsuarioAtual();
  const agenda = await db.usuario.findUnique({ where: { id: eu.id }, select: { agendaTokenHash: true } });
  return (
    <div className="grid max-w-4xl gap-6 md:grid-cols-2">
      <section className="cartao p-6">
        <h2 className="mb-1 font-semibold">Dados</h2>
        <p className="mb-4 text-sm text-slate-500">{eu.email} · {nomesPapel[eu.papel]}</p>
        <FormPerfil nome={eu.nome} assinatura={eu.assinaturaWhatsapp} />
      </section>
      <section className="cartao p-6">
        <h2 className="mb-4 font-semibold">Trocar senha</h2>
        <FormTrocarSenha />
      </section>
      <section className="cartao p-6 md:col-span-2">
        <h2 className="mb-2 font-semibold">📅 Minha agenda no Google Agenda</h2>
        <LinkAgenda ativo={!!agenda?.agendaTokenHash} />
      </section>
    </div>
  );
}
