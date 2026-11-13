import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando, Etiqueta } from "@/components/ui";
import { getUsuarioAtual } from "@/lib/auth";
import { veTodasConversas } from "@/lib/atendimento";
import { db } from "@/lib/db";
import { apagarEtiqueta, apagarResposta } from "./actions";
import { FormEtiqueta, FormResposta } from "./formularios";

export const metadata: Metadata = { title: "Respostas rápidas e etiquetas" };

export default function PaginaRespostas() {
  return (
    <>
      <Cabecalho
        titulo="Respostas rápidas e etiquetas"
        subtitulo='Na conversa, digite "/" para usar uma resposta pronta.'
        acoes={<Link href="/atendimento" className="botao-secundario">Voltar ao atendimento</Link>}
      />
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </>
  );
}

async function Conteudo() {
  await connection();
  const eu = await getUsuarioAtual();
  const gestor = veTodasConversas(eu.papel);
  const [respostas, etiquetas] = await Promise.all([
    db.respostaRapida.findMany({
      where: { organizacaoId: eu.organizacao.id, OR: [{ usuarioId: null }, { usuarioId: eu.id }] },
      orderBy: { atalho: "asc" },
    }),
    db.etiqueta.findMany({
      where: { organizacaoId: eu.organizacao.id },
      orderBy: { nome: "asc" },
      include: { _count: { select: { conversas: true } } },
    }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="space-y-4">
        <div className="cartao p-4">
          <h2 className="mb-3 font-semibold">Nova resposta rápida</h2>
          <FormResposta podeEquipe={gestor} />
        </div>
        <div className="cartao divide-y divide-slate-100">
          {respostas.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhuma resposta ainda.</p>}
          {respostas.map((r) => {
            const podeApagar = r.usuarioId ? r.usuarioId === eu.id : gestor;
            return (
              <div key={r.id} className="flex gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-marca-700">/{r.atalho}</span>
                    <Etiqueta cor={r.usuarioId ? "#7c3aed" : "#0891b2"}>{r.usuarioId ? "só minha" : "equipe"}</Etiqueta>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{r.texto}</p>
                </div>
                {podeApagar && (
                  <form action={apagarResposta.bind(null, r.id)}>
                    <button className="text-xs text-slate-400 underline hover:text-red-700">apagar</button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        {gestor && (
          <div className="cartao p-4">
            <h2 className="mb-3 font-semibold">Nova etiqueta</h2>
            <FormEtiqueta />
          </div>
        )}
        <div className="cartao p-4">
          <h2 className="mb-3 font-semibold">Etiquetas</h2>
          {etiquetas.length === 0 && <p className="text-sm text-slate-500">Nenhuma etiqueta ainda.</p>}
          <ul className="space-y-2">
            {etiquetas.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <Etiqueta cor={e.cor}>{e.nome}</Etiqueta>
                <span className="text-xs text-slate-500">{e._count.conversas} conversa(s)</span>
                {gestor && (
                  <form action={apagarEtiqueta.bind(null, e.id)}>
                    <button className="text-xs text-slate-400 underline hover:text-red-700" title="Tira a etiqueta de todas as conversas">apagar</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {!gestor && <p className="mt-3 text-xs text-slate-500">Só administrador ou gestor cria e apaga etiquetas.</p>}
        </div>
      </section>
    </div>
  );
}
