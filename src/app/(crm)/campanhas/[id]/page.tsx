// Uma campanha: números (enviadas, entregues, lidas, responderam), controles
// (iniciar, pausar, cancelar), teste, texto e a lista de quem recebe.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando, Etiqueta } from "@/components/ui";
import { exigirPapel } from "@/lib/auth";
import { obterAutomacao } from "@/lib/automacao/config";
import { estaAberto, paraDataLocal } from "@/lib/automacao/horario";
import { montarTexto } from "@/lib/campanhas/motor";
import { estimarDuracao } from "@/lib/campanhas/ritmo";
import { db } from "@/lib/db";
import { dataHora, telefone } from "@/lib/formatar";
import { simulandoEnvio } from "@/lib/whatsapp/evolution";
import { AtualizacaoAutomatica } from "../../atendimento/interativos";
import { cancelarCampanha, excluirRascunho, iniciarCampanha, pausarCampanha, tirarDestinatario } from "../actions";
import { FormTexto, FormTeste } from "../formularios";
import { STATUS, STATUS_DESTINATARIO } from "../rotulos";

export const metadata: Metadata = { title: "Campanha" };

export default function PaginaCampanha({ params, searchParams }: PageProps<"/campanhas/[id]">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: { params: PageProps<"/campanhas/[id]">["params"]; searchParams: PageProps<"/campanhas/[id]">["searchParams"] }) {
  await connection();
  const eu = await exigirPapel("ADMIN", "GESTOR");
  const { id } = await params;
  const { preparada } = await searchParams;
  const campanha = await db.campanha.findFirst({
    where: { id, organizacaoId: eu.organizacao.id },
    include: {
      criadoPor: { select: { nome: true } },
      destinatarios: {
        orderBy: { ordem: "asc" },
        include: { negocio: { select: { id: true, etapa: { select: { nome: true, cor: true } } } } },
      },
    },
  });
  if (!campanha) notFound();
  const config = await obterAutomacao(eu.organizacao.id);

  const d = campanha.destinatarios;
  const n = (f: (x: (typeof d)[number]) => boolean) => d.filter(f).length;
  const pendentes = n((x) => x.status === "PENDENTE");
  const numeros = [
    { rotulo: "Na fila", valor: pendentes },
    { rotulo: "Enviadas", valor: n((x) => x.status === "ENVIADA") },
    { rotulo: "Entregues", valor: n((x) => !!x.entregueEm) },
    { rotulo: "Lidas", valor: n((x) => !!x.lidaEm) },
    { rotulo: "Responderam", valor: n((x) => !!x.respondeuEm) },
    { rotulo: "Erros", valor: n((x) => x.status === "ERRO") },
    { rotulo: "Fora", valor: n((x) => x.status === "IGNORADA") },
  ];
  const editavel = campanha.status === "RASCUNHO" || campanha.status === "PAUSADA";
  const ativa = campanha.status === "AGENDADA" || campanha.status === "ENVIANDO";
  const exemplo = d[0] ? montarTexto(campanha.texto, d[0], eu.organizacao.nome, () => 0) : null;
  const status = STATUS[campanha.status];

  return (
    <>
      {ativa && <AtualizacaoAutomatica segundos={15} />}
      <Cabecalho
        titulo={campanha.nome}
        subtitulo={`${campanha.tipo === "RECICLAGEM" ? "Reciclagem · " : ""}criada por ${campanha.criadoPor?.nome ?? "—"} em ${dataHora(campanha.criadoEm)}`}
        acoes={<Link href="/campanhas" className="botao-secundario">Voltar</Link>}
      />

      <div className="space-y-6">
        {preparada && (
          <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">
            Campanha de reciclagem preparada: {String(preparada)} negócio(s) criado(s) no <Link href="/funil" className="underline">funil</Link>. Revise
            a mensagem, mande um teste e clique em Iniciar.
          </p>
        )}
        {simulandoEnvio() && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Modo simulação ligado:</strong> nada sai para o WhatsApp.
          </p>
        )}

        <section className="cartao flex flex-wrap items-center gap-3 p-4">
          <Etiqueta cor={status.cor}>{status.rotulo}</Etiqueta>
          {campanha.motivo && <span className="text-sm text-amber-700">{campanha.motivo}</span>}
          {campanha.status === "AGENDADA" && (
            <span className="text-sm text-slate-600">
              {campanha.iniciarEm ? `começa em ${dataHora(campanha.iniciarEm)}` : "começa em até 30 segundos (ou quando a campanha anterior terminar)"}
            </span>
          )}
          {campanha.status === "ENVIANDO" && campanha.proximoEnvioEm && (
            <span className="text-sm text-slate-600">próxima mensagem a partir de {dataHora(campanha.proximoEnvioEm)}</span>
          )}
          {!estaAberto(config.horarios) && ativa && <span className="text-sm text-slate-500">(fora do horário de atendimento: espera abrir)</span>}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {editavel && pendentes > 0 && (
              <form action={iniciarCampanha.bind(null, campanha.id)} className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-500" htmlFor="iniciarEm">Começar em (opcional)</label>
                <input
                  id="iniciarEm"
                  name="iniciarEm"
                  type="datetime-local"
                  min={paraDataLocal(new Date())}
                  defaultValue={campanha.iniciarEm ? paraDataLocal(campanha.iniciarEm) : ""}
                  className="campo w-auto py-1"
                />
                <button className="botao">{campanha.status === "PAUSADA" ? "▶ Retomar" : "▶ Iniciar"} ({pendentes})</button>
              </form>
            )}
            {ativa && (
              <form action={pausarCampanha.bind(null, campanha.id)}>
                <button className="botao-secundario">⏸ Pausar</button>
              </form>
            )}
            {campanha.status === "RASCUNHO" && (
              <form action={excluirRascunho.bind(null, campanha.id)}>
                <button className="botao-secundario text-red-700">Excluir rascunho</button>
              </form>
            )}
            {(ativa || campanha.status === "PAUSADA") && (
              <form action={cancelarCampanha.bind(null, campanha.id)}>
                <button className="botao-secundario text-red-700">Cancelar campanha</button>
              </form>
            )}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {numeros.map((x) => (
            <div key={x.rotulo} className="cartao p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{x.rotulo}</div>
              <div className="mt-1 text-xl font-semibold">{x.valor}</div>
            </div>
          ))}
        </div>
        {pendentes > 0 && <p className="text-xs text-slate-500">Tempo estimado para os que estão na fila: {estimarDuracao(pendentes)}.</p>}

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="cartao space-y-4 p-4">
            <h2 className="font-semibold">Mensagem</h2>
            {editavel ? <FormTexto id={campanha.id} texto={campanha.texto} /> : <p className="whitespace-pre-wrap text-sm">{campanha.texto}</p>}
            {exemplo && (
              <div>
                <div className="mb-1 text-xs font-medium text-slate-500">Como chega para {d[0].nome} (uma das variações):</div>
                <p className="whitespace-pre-wrap rounded-lg bg-green-50 p-3 text-sm">{exemplo}</p>
              </div>
            )}
          </section>
          <section className="cartao space-y-3 p-4">
            <h2 className="font-semibold">Enviar teste</h2>
            <p className="text-sm text-slate-600">Manda a mensagem agora para um número seu, com o marcador [TESTE]. Não conta no limite nem entra nos números.</p>
            <FormTeste id={campanha.id} />
          </section>
        </div>

        <section className="cartao p-4">
          <h2 className="mb-3 font-semibold">Destinatários ({d.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Quem</th>
                  <th className="py-2 pr-3">WhatsApp</th>
                  <th className="py-2 pr-3">Situação</th>
                  <th className="py-2 pr-3">Enviada</th>
                  <th className="py-2 pr-3">Acompanhamento</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.map((x) => (
                  <tr key={x.id}>
                    <td className="py-2 pr-3">
                      {x.clienteId ? <Link href={`/clientes/${x.clienteId}`} className="hover:underline">{x.nome}</Link> : x.nome}
                      {x.negocio && (
                        <div>
                          <Link href="/funil" className="text-xs text-slate-500 hover:underline">negócio: </Link>
                          <Etiqueta cor={x.negocio.etapa.cor}>{x.negocio.etapa.nome}</Etiqueta>
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-600">{telefone(x.telefone)}</td>
                    <td className="py-2 pr-3">
                      <Etiqueta cor={STATUS_DESTINATARIO[x.status].cor}>{STATUS_DESTINATARIO[x.status].rotulo}</Etiqueta>
                      {x.motivo && <div className="mt-0.5 text-xs text-slate-500">{x.motivo}</div>}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-slate-500">{x.enviadaEm ? dataHora(x.enviadaEm) : "—"}</td>
                    <td className="py-2 pr-3 text-xs">
                      {x.respondeuEm ? (
                        <span className="font-medium text-green-700">💬 respondeu</span>
                      ) : x.lidaEm ? (
                        <span className="text-sky-700">✓✓ lida</span>
                      ) : x.entregueEm ? (
                        <span className="text-slate-600">✓✓ entregue</span>
                      ) : x.status === "ENVIADA" ? (
                        <span className="text-slate-400">✓ enviada</span>
                      ) : null}
                    </td>
                    <td className="py-2 text-right">
                      {editavel && x.status === "PENDENTE" && (
                        <form action={tirarDestinatario.bind(null, campanha.id, x.id)}>
                          <button className="text-xs text-red-700 hover:underline">tirar</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
