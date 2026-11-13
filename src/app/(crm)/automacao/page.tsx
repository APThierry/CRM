// Automação: horário de atendimento, chatbot, sequências de follow-up e a fila de envios.
// Todos veem; só administrador e gestor alteram.
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando, Etiqueta } from "@/components/ui";
import { getUsuarioAtual } from "@/lib/auth";
import { conversasVisiveis, preencherVariaveis, veTodasConversas } from "@/lib/atendimento";
import { obterAutomacao, textoDoMenu } from "@/lib/automacao/config";
import { descreverHorarios, estaAberto } from "@/lib/automacao/horario";
import { db } from "@/lib/db";
import { telefone } from "@/lib/formatar";
import { simulandoEnvio } from "@/lib/whatsapp/evolution";
import { cancelarAgendada } from "../atendimento/actions";
import { apagarOpcao, apagarSequencia, subirOpcao } from "./actions";
import { FormBot, FormHorario, FormOpcao, FormSequencia } from "./formularios";

export const metadata: Metadata = { title: "Automação" };

export default function PaginaAutomacao() {
  return (
    <>
      <Cabecalho titulo="Automação" subtitulo="O CRM responde e faz follow-up sozinho, do jeito que você configurar aqui." />
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </>
  );
}

const quando = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function tempo(minutos: number) {
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const partes = [dias && `${dias} dia${dias > 1 ? "s" : ""}`, horas && `${horas} h`, minutos % 60 && `${minutos % 60} min`].filter(Boolean);
  return partes.join(" e ");
}

async function Conteudo() {
  await connection();
  const eu = await getUsuarioAtual();
  const org = eu.organizacao.id;
  const gestor = veTodasConversas(eu.papel);
  const config = await obterAutomacao(org);
  const [opcoes, etiquetas, atendentes, sequencias, fila] = await Promise.all([
    db.opcaoBot.findMany({
      where: { organizacaoId: org },
      orderBy: { ordem: "asc" },
      include: { etiqueta: { select: { nome: true, cor: true } }, atendente: { select: { nome: true } } },
    }),
    db.etiqueta.findMany({ where: { organizacaoId: org }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    db.usuario.findMany({ where: { organizacaoId: org, ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    db.sequencia.findMany({
      where: { organizacaoId: org },
      orderBy: { nome: "asc" },
      include: {
        passos: { orderBy: { ordem: "asc" } },
        _count: { select: { agendadas: { where: { status: "PENDENTE" } } } },
      },
    }),
    db.mensagemAgendada.findMany({
      where: { organizacaoId: org, status: { in: ["PENDENTE", "ERRO"] }, conversa: conversasVisiveis(eu) },
      orderBy: [{ status: "asc" }, { enviarEm: "asc" }],
      take: 50,
      include: {
        conversa: { select: { id: true, nome: true, telefone: true, cliente: { select: { nome: true } } } },
        usuario: { select: { nome: true } },
        sequencia: { select: { nome: true } },
      },
    }),
  ]);
  const horario = descreverHorarios(config.horarios);
  const aberto = estaAberto(config.horarios);
  const exemploMenu = preencherVariaveis(textoDoMenu(config.botBoasVindas, opcoes), {
    nome: "Ana Souza",
    empresa: eu.organizacao.nome,
    horario,
  });

  return (
    <div className="space-y-6">
      {simulandoEnvio() && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Modo simulação ligado</strong> (WHATSAPP_SIMULAR_ENVIO=1): as mensagens automáticas ficam registradas no CRM, mas
          nada sai para o WhatsApp.
        </p>
      )}
      {!gestor && <p className="text-sm text-slate-500">Só administrador ou gestor altera estas configurações.</p>}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Horário de atendimento ------------------------------------------------ */}
        <section className="cartao p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Horário de atendimento</h2>
            <Etiqueta cor={config.horarioAtivo ? "#16a34a" : "#64748b"}>{config.horarioAtivo ? "aviso ligado" : "aviso desligado"}</Etiqueta>
            <span className="text-xs text-slate-500">Agora: {aberto ? "aberto" : "fechado"}</span>
          </div>
          <p className="mb-3 text-sm text-slate-600">
            Fora do horário, o cliente recebe um aviso. Os follow-ups também esperam o horário de atendimento.
          </p>
          {gestor ? (
            <FormHorario ativo={config.horarioAtivo} horarios={config.horarios} mensagem={config.mensagemForaHorario} />
          ) : (
            <p className="text-sm">{horario}</p>
          )}
        </section>

        {/* Chatbot --------------------------------------------------------------- */}
        <section className="cartao p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-semibold">Chatbot de boas-vindas</h2>
            <Etiqueta cor={config.botAtivo ? "#16a34a" : "#64748b"}>{config.botAtivo ? "ligado" : "desligado"}</Etiqueta>
          </div>
          <p className="mb-3 text-sm text-slate-600">
            Quando alguém escreve pela primeira vez (e a conversa está na fila), o bot manda o menu. A escolha coloca a etiqueta e, se
            você quiser, já passa para um atendente. Assim que uma pessoa responde, o bot para.
          </p>
          {gestor && <FormBot ativo={config.botAtivo} boasVindas={config.botBoasVindas} horas={config.botReativarHoras} />}

          <h3 className="mb-2 mt-5 text-sm font-semibold">Opções do menu</h3>
          <ol className="mb-3 divide-y divide-slate-100 rounded border border-slate-200">
            {opcoes.length === 0 && <li className="p-3 text-sm text-slate-500">Nenhuma opção.</li>}
            {opcoes.map((o, i) => (
              <li key={o.id} className="flex gap-3 p-3 text-sm">
                <span className="font-bold text-marca-700">{o.ordem}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{o.rotulo}</div>
                  {o.resposta && <p className="whitespace-pre-wrap text-xs text-slate-600">↳ {o.resposta}</p>}
                  <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-500">
                    {o.etiqueta && <Etiqueta cor={o.etiqueta.cor}>{o.etiqueta.nome}</Etiqueta>}
                    <span>{o.atendente ? `→ ${o.atendente.nome}` : "→ fila"}</span>
                  </div>
                </div>
                {gestor && (
                  <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    {i > 0 && (
                      <form action={subirOpcao.bind(null, o.id)}>
                        <button className="text-slate-500 underline hover:text-slate-800" aria-label={`Subir ${o.rotulo}`}>↑ subir</button>
                      </form>
                    )}
                    <form action={apagarOpcao.bind(null, o.id)}>
                      <button className="text-slate-400 underline hover:text-red-700">apagar</button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {gestor && (
            <details className="mb-3">
              <summary className="cursor-pointer text-sm font-semibold text-marca-700">+ Nova opção</summary>
              <div className="mt-2">
                <FormOpcao etiquetas={etiquetas} atendentes={atendentes} />
              </div>
            </details>
          )}
          <details>
            <summary className="cursor-pointer text-sm text-slate-600">Ver como o cliente recebe</summary>
            <p className="mt-2 max-w-sm whitespace-pre-wrap rounded-lg bg-[#d9fdd3] p-3 text-sm shadow-sm">{exemploMenu}</p>
          </details>
        </section>
      </div>

      {/* Sequências --------------------------------------------------------------- */}
      <section className="cartao p-4">
        <h2 className="mb-1 font-semibold">Sequências de follow-up</h2>
        <p className="mb-4 text-sm text-slate-600">
          Mensagens que saem aos poucos (ex.: 1, 3 e 7 dias depois) até o cliente responder. Inicie numa conversa, no painel da direita
          do Atendimento. Se o cliente responder, o resto é cancelado sozinho.
        </p>
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <ul className="space-y-3">
            {sequencias.length === 0 && <li className="text-sm text-slate-500">Nenhuma sequência ainda.</li>}
            {sequencias.map((s) => (
              <li key={s.id} className="rounded border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium">{s.nome}</span>
                  <span className="flex items-center gap-3 text-xs text-slate-500">
                    {s._count.agendadas > 0 && `${s._count.agendadas} mensagem(ns) na fila`}
                    {gestor && (
                      <form action={apagarSequencia.bind(null, s.id)}>
                        <button className="text-slate-400 underline hover:text-red-700">apagar</button>
                      </form>
                    )}
                  </span>
                </div>
                <ol className="space-y-1.5">
                  {s.passos.map((p) => (
                    <li key={p.id} className="text-sm">
                      <span className="text-xs font-medium text-marca-700">depois de {tempo(p.esperaMinutos)}:</span>{" "}
                      <span className="whitespace-pre-wrap text-slate-700">{p.texto}</span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
          {gestor && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Nova sequência</h3>
              <FormSequencia />
            </div>
          )}
        </div>
      </section>

      {/* Fila de envios -------------------------------------------------------- */}
      <section className="cartao p-4">
        <h2 className="mb-1 font-semibold">Fila de envios</h2>
        <p className="mb-3 text-sm text-slate-600">Mensagens agendadas que ainda vão sair (e as que deram erro).</p>
        {fila.length === 0 ? (
          <p className="text-sm text-slate-500">Nada agendado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3 font-medium">Quando</th>
                  <th className="py-2 pr-3 font-medium">Para</th>
                  <th className="py-2 pr-3 font-medium">Mensagem</th>
                  <th className="py-2 pr-3 font-medium">Origem</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fila.map((a) => (
                  <tr key={a.id} className={a.status === "ERRO" ? "bg-red-50" : ""}>
                    <td className="whitespace-nowrap py-2 pr-3">{a.status === "ERRO" ? <span className="text-red-700">⚠ erro</span> : quando(a.enviarEm)}</td>
                    <td className="py-2 pr-3">
                      <Link href={`/atendimento?c=${a.conversa.id}`} className="text-marca-700 hover:underline">
                        {a.conversa.cliente?.nome ?? a.conversa.nome ?? telefone(a.conversa.telefone)}
                      </Link>
                    </td>
                    <td className="max-w-md py-2 pr-3">
                      <p className="line-clamp-2 text-slate-700">{a.texto}</p>
                      {a.status === "ERRO" && a.motivo && <p className="text-xs text-red-700">{a.motivo}</p>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">
                      {a.sequencia?.nome ?? "agendada"}
                      {a.usuario && ` · ${a.usuario.nome.split(" ")[0]}`}
                    </td>
                    <td className="py-2 text-right">
                      {a.status === "PENDENTE" && (
                        <form action={cancelarAgendada.bind(null, a.id)}>
                          <button className="text-xs text-slate-500 underline hover:text-red-700">cancelar</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
