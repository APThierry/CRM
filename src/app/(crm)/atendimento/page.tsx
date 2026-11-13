// Central de atendimento: todas as conversas do WhatsApp da empresa numa tela.
// Esquerda: lista (abas Abertas/Minhas/Fila/Finalizadas). Meio: a conversa.
// Direita: cliente, funil e etiquetas. No celular, uma coluna por vez.
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getUsuarioAtual } from "@/lib/auth";
import { PainelConversa } from "./conversa";
import { AtualizacaoAutomatica } from "./interativos";
import { ABAS, ListaConversas, type Aba, type Filtros } from "./lista";
import { PainelDetalhes } from "./painel";

export const metadata: Metadata = { title: "Atendimento" };

export default function PaginaAtendimento({ searchParams }: PageProps<"/atendimento">) {
  return (
    // Ocupa a tela toda (desfaz o espaçamento do <main> do layout).
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-4rem)] overflow-hidden border-slate-200 bg-white md:-mx-8 md:h-dvh">
      <Suspense fallback={<div className="p-6 text-sm text-slate-400">Carregando conversas…</div>}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

async function Conteudo({ searchParams }: { searchParams: PageProps<"/atendimento">["searchParams"] }) {
  await connection();
  const [eu, sp] = await Promise.all([getUsuarioAtual(), searchParams]);
  const aba = texto(sp.aba);
  const filtros: Filtros = {
    aba: aba && aba in ABAS ? (aba as Aba) : "abertas",
    q: texto(sp.q),
    etiqueta: texto(sp.etiqueta),
  };
  const selecionada = texto(sp.c);

  return (
    <>
      <AtualizacaoAutomatica />
      <div className={`${selecionada ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-slate-200 md:w-80`}>
        <ListaConversas eu={eu} filtros={filtros} selecionada={selecionada} />
      </div>
      {selecionada ? (
        <div className="relative flex min-w-0 flex-1">
          <PainelConversa eu={eu} conversaId={selecionada} filtros={filtros} />
          <PainelDetalhes eu={eu} conversaId={selecionada} />
        </div>
      ) : (
        <div className="hidden flex-1 items-center justify-center bg-[#efeae2] md:flex">
          <div className="max-w-sm rounded-lg bg-white/80 p-6 text-center text-sm text-slate-600">
            <div className="mb-2 text-3xl">💬</div>
            Escolha uma conversa à esquerda.
            <p className="mt-2 text-xs text-slate-500">
              Mensagens novas aparecem sozinhas. Conversas na <strong>Fila</strong> ainda não têm atendente: quem responder primeiro fica com ela.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
