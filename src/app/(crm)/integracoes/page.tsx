// Integrações: webhooks de saída (avisar outros sistemas) e onde achar o link
// da agenda e as exportações. Só o administrador.
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando, Etiqueta, Vazio } from "@/components/ui";
import { exigirPapel } from "@/lib/auth";
import { db } from "@/lib/db";
import { dataHora } from "@/lib/formatar";
import { MAX_TENTATIVAS } from "@/lib/webhooks/disparar";
import { EVENTOS, ehEvento } from "@/lib/webhooks/eventos";
import { alternarWebhook, excluirWebhook, reenviarEntrega, trocarSegredo } from "./actions";
import { BotaoTestar, FormEditarWebhook, FormNovoWebhook } from "./formularios";

export const metadata: Metadata = { title: "Integrações" };

const STATUS_ENTREGA = {
  PENDENTE: { rotulo: "Na fila", cor: "#64748b" },
  ENVIANDO: { rotulo: "Enviando", cor: "#0284c7" },
  ENTREGUE: { rotulo: "Entregue", cor: "#16a34a" },
  FALHOU: { rotulo: "Falhou", cor: "#dc2626" },
} as const;

export default function PaginaIntegracoes() {
  return (
    <>
      <Cabecalho titulo="Integrações" subtitulo="Ligue o CRM a outros sistemas: n8n, Zapier, Make, planilhas, sistemas de nota fiscal..." />
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </>
  );
}

async function Conteudo() {
  await connection();
  const eu = await exigirPapel("ADMIN");
  const webhooks = await db.webhook.findMany({
    where: { organizacaoId: eu.organizacao.id },
    orderBy: { criadoEm: "asc" },
    include: { entregas: { orderBy: { criadoEm: "desc" }, take: 10 } },
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="cartao p-4 text-sm">
          <h2 className="mb-1 font-semibold">📅 Google Agenda</h2>
          <p className="text-slate-600">
            Cada pessoa tem um link próprio com as turmas, as tarefas e as mensagens agendadas dela. Gere o seu em{" "}
            <Link href="/perfil" className="underline">Meu perfil</Link>.
          </p>
        </section>
        <section className="cartao p-4 text-sm">
          <h2 className="mb-1 font-semibold">📊 Exportar planilhas</h2>
          <p className="text-slate-600">
            Clientes, negócios, certificados e o desempenho por atendente saem em CSV (abre no Excel e no Google Planilhas) na tela{" "}
            <Link href="/relatorios" className="underline">Relatórios</Link>.
          </p>
        </section>
      </div>

      <section className="cartao space-y-3 p-4">
        <h2 className="font-semibold">Webhooks: avisar outro sistema</h2>
        <p className="text-sm text-slate-600">
          Quando algo acontece no CRM (venda ganha, cliente novo, certificado emitido...), o CRM manda os dados para o endereço cadastrado.
          Se o outro sistema estiver fora do ar, tenta de novo até {MAX_TENTATIVAS} vezes (depois de 1 min, 5 min, 30 min, 2 h e 6 h).
          Como conferir a assinatura: <code>docs/INTEGRACOES.md</code>.
        </p>
        <details className="rounded-md border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">+ Novo webhook</summary>
          <div className="mt-3">
            <FormNovoWebhook />
          </div>
        </details>
      </section>

      {webhooks.length === 0 ? (
        <Vazio>Nenhum webhook cadastrado.</Vazio>
      ) : (
        webhooks.map((w) => (
          <section key={w.id} className="cartao space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{w.nome}</h3>
              <Etiqueta cor={w.ativo ? "#16a34a" : "#94a3b8"}>{w.ativo ? "Ligado" : "Desligado"}</Etiqueta>
              <span className="break-all text-xs text-slate-500">{w.url}</span>
              <div className="ml-auto flex flex-wrap items-start gap-2">
                <BotaoTestar id={w.id} />
                <form action={alternarWebhook.bind(null, w.id)}>
                  <button className="botao-secundario">{w.ativo ? "Desligar" : "Ligar"}</button>
                </form>
                <form action={excluirWebhook.bind(null, w.id)}>
                  <button className="botao-secundario text-red-700">Excluir</button>
                </form>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {w.eventos.map((e) => (
                <Etiqueta key={e}>{ehEvento(e) ? EVENTOS[e] : e}</Etiqueta>
              ))}
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer text-slate-600">Segredo de assinatura</summary>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-slate-100 px-2 py-1 text-xs">{w.segredo}</code>
                <form action={trocarSegredo.bind(null, w.id)}>
                  <button className="text-xs text-red-700 hover:underline">gerar outro</button>
                </form>
              </div>
              <p className="mt-1 text-xs text-slate-500">Cole este segredo no outro sistema para ele conferir que o aviso veio mesmo do CRM.</p>
            </details>

            <details className="text-sm">
              <summary className="cursor-pointer text-slate-600">Editar endereço e eventos</summary>
              <div className="mt-3">
                <FormEditarWebhook id={w.id} url={w.url} eventos={w.eventos} />
              </div>
            </details>

            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Últimos avisos</h4>
              {w.entregas.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-1.5 pr-3">Quando</th>
                        <th className="py-1.5 pr-3">Evento</th>
                        <th className="py-1.5 pr-3">Situação</th>
                        <th className="py-1.5 pr-3">Tentativas</th>
                        <th className="py-1.5">Detalhe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {w.entregas.map((e) => (
                        <tr key={e.id}>
                          <td className="whitespace-nowrap py-1.5 pr-3 text-xs text-slate-500">{dataHora(e.criadoEm)}</td>
                          <td className="py-1.5 pr-3"><code className="text-xs">{e.evento}</code></td>
                          <td className="py-1.5 pr-3"><Etiqueta cor={STATUS_ENTREGA[e.status].cor}>{STATUS_ENTREGA[e.status].rotulo}</Etiqueta></td>
                          <td className="py-1.5 pr-3 text-xs">{e.tentativas}</td>
                          <td className="py-1.5 text-xs text-slate-500">
                            {e.status === "ENTREGUE" && `resposta ${e.respostaCodigo ?? "—"}`}
                            {e.status === "PENDENTE" && e.erro && `${e.erro} · nova tentativa ${dataHora(e.proximaEm)}`}
                            {e.status === "FALHOU" && (
                              <span className="flex flex-wrap items-center gap-2">
                                {e.erro}
                                {e.evento !== "teste" && (
                                  <form action={reenviarEntrega.bind(null, e.id)}>
                                    <button className="text-sky-700 hover:underline">reenviar</button>
                                  </form>
                                )}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
