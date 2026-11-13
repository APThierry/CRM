// Campanhas: lista, envios de hoje e reciclagem (certificados vencendo).
// Só administrador e gestor.
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando, Etiqueta, Vazio } from "@/components/ui";
import { exigirPapel } from "@/lib/auth";
import { obterAutomacao } from "@/lib/automacao/config";
import { enviadasHoje } from "@/lib/campanhas/motor";
import { descreverCursos, listarReciclagens } from "@/lib/campanhas/reciclagem";
import { RITMO } from "@/lib/campanhas/ritmo";
import { db } from "@/lib/db";
import { data, dataHora } from "@/lib/formatar";
import { simulandoEnvio } from "@/lib/whatsapp/evolution";
import { prepararCampanhaReciclagem } from "./actions";
import { FormReciclagem } from "./formularios";
import { STATUS } from "./rotulos";

export const metadata: Metadata = { title: "Campanhas" };

export default function PaginaCampanhas({ searchParams }: PageProps<"/campanhas">) {
  return (
    <>
      <Cabecalho
        titulo="Campanhas"
        subtitulo="Mensagens para vários clientes, enviadas devagar para proteger o número da empresa."
        acoes={<Link href="/campanhas/nova" className="botao">+ Nova campanha</Link>}
      />
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/campanhas">["searchParams"] }) {
  await connection();
  const eu = await exigirPapel("ADMIN", "GESTOR");
  const org = eu.organizacao.id;
  const { reciclagem } = await searchParams;
  const config = await obterAutomacao(org);
  const [campanhas, hoje, grupos, descadastrados] = await Promise.all([
    db.campanha.findMany({
      where: { organizacaoId: org },
      orderBy: { criadoEm: "desc" },
      take: 50,
      include: { criadoPor: { select: { nome: true } } },
    }),
    enviadasHoje(org),
    listarReciclagens(org, config.reciclagemDias),
    db.descadastro.count({ where: { organizacaoId: org } }),
  ]);
  const ids = { campanhaId: { in: campanhas.map((c) => c.id) } };
  const [contagens, lidas, responderam] = await Promise.all([
    db.destinatarioCampanha.groupBy({ by: ["campanhaId", "status"], where: ids, _count: true }),
    db.destinatarioCampanha.groupBy({ by: ["campanhaId"], where: { ...ids, lidaEm: { not: null } }, _count: true }),
    db.destinatarioCampanha.groupBy({ by: ["campanhaId"], where: { ...ids, respondeuEm: { not: null } }, _count: true }),
  ]);
  const de = (lista: { campanhaId: string; _count: number }[], id: string) => lista.find((l) => l.campanhaId === id)?._count ?? 0;
  const conta = (id: string, ...status: string[]) =>
    contagens.filter((c) => c.campanhaId === id && status.includes(c.status)).reduce((s, c) => s + c._count, 0);

  return (
    <div className="space-y-6">
      {simulandoEnvio() && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Modo simulação ligado</strong> (WHATSAPP_SIMULAR_ENVIO=1): as campanhas registram as mensagens no CRM, mas nada sai para o WhatsApp.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="cartao p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Enviadas hoje</div>
          <div className="mt-2 text-2xl font-semibold">{hoje} <span className="text-base font-normal text-slate-400">/ {RITMO.limitePorDia}</span></div>
          <div className="mt-1 text-xs text-slate-500">limite diário de todas as campanhas</div>
        </div>
        <div className="cartao p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Ritmo</div>
          <div className="mt-2 text-sm">
            1 mensagem a cada {RITMO.intervaloMinSeg}–{RITMO.intervaloMaxSeg} s, pausa de {RITMO.pausaMin} min a cada {RITMO.pausaACada}, só no
            horário de atendimento.
          </div>
        </div>
        <div className="cartao p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Pediram para sair</div>
          <div className="mt-2 text-2xl font-semibold">{descadastrados}</div>
          <div className="mt-1 text-xs text-slate-500">nunca recebem campanhas</div>
        </div>
      </div>

      <section className="cartao p-4">
        <h2 className="mb-3 font-semibold">Campanhas</h2>
        {campanhas.length === 0 ? (
          <Vazio>Nenhuma campanha ainda. <Link href="/campanhas/nova" className="underline">Criar a primeira</Link></Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Campanha</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Enviadas</th>
                  <th className="py-2 pr-3 text-right">Lidas</th>
                  <th className="py-2 pr-3 text-right">Responderam</th>
                  <th className="py-2 text-right">Criada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campanhas.map((c) => {
                  const total = conta(c.id, "PENDENTE", "ENVIANDO", "ENVIADA", "ERRO");
                  const enviadas = conta(c.id, "ENVIADA");
                  return (
                    <tr key={c.id}>
                      <td className="py-2 pr-3">
                        <Link href={`/campanhas/${c.id}`} className="font-medium hover:underline">{c.nome}</Link>
                        {c.tipo === "RECICLAGEM" && <span className="ml-2"><Etiqueta cor="#b45309">reciclagem</Etiqueta></span>}
                      </td>
                      <td className="py-2 pr-3"><Etiqueta cor={STATUS[c.status].cor}>{STATUS[c.status].rotulo}</Etiqueta></td>
                      <td className="py-2 pr-3 text-right">{enviadas}/{total}</td>
                      <td className="py-2 pr-3 text-right">{de(lidas, c.id)}</td>
                      <td className="py-2 pr-3 text-right">{de(responderam, c.id)}</td>
                      <td className="py-2 text-right text-xs text-slate-500">{dataHora(c.criadoEm)}<div>{c.criadoPor?.nome}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="cartao p-4">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">🔁 Reciclagem</h2>
          <span className="text-xs text-slate-500">certificados que vencem nos próximos {config.reciclagemDias} dias (ou venceram há até 30) e ainda não foram avisados</span>
        </div>
        {reciclagem === "vazia" && <p className="mb-2 rounded bg-slate-50 p-2 text-sm text-slate-600">Não há certificados para avisar agora.</p>}
        {grupos.length === 0 ? (
          <Vazio>Nenhum cliente com certificado para reciclar agora.</Vazio>
        ) : (
          <>
            <ul className="mb-4 divide-y divide-slate-100 text-sm">
              {grupos.map((g) => (
                <li key={g.clienteId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/clientes/${g.clienteId}`} className="font-medium hover:underline">{g.cliente}</Link>
                    <div className="text-xs text-slate-500">{descreverCursos(g.cursos)}</div>
                  </div>
                  <span className={`text-xs font-medium ${g.vence < new Date() ? "text-red-600" : "text-amber-700"}`}>
                    {g.vence < new Date() ? "venceu" : "vence"} {data(g.vence)}
                  </span>
                </li>
              ))}
            </ul>
            <form action={prepararCampanhaReciclagem} className="rounded-md bg-amber-50 p-3">
              <p className="mb-2 text-sm text-amber-900">
                Ao preparar, o CRM cria <strong>um negócio de reciclagem no funil</strong> para cada curso e monta a campanha como rascunho.
                Nada é enviado até você revisar e clicar em Iniciar.
              </p>
              <button className="botao">Preparar campanha de reciclagem ({grupos.length} cliente{grupos.length > 1 ? "s" : ""})</button>
            </form>
          </>
        )}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-marca-700">Configurar reciclagem</summary>
          <div className="mt-3">
            <FormReciclagem dias={config.reciclagemDias} texto={config.reciclagemTexto} />
          </div>
        </details>
      </section>
    </div>
  );
}
