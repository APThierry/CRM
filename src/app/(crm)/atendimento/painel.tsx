// Coluna da direita: cliente da conversa, negócios no funil e etiquetas.
import Link from "next/link";
import type { UsuarioAtual } from "@/lib/auth";
import { conversasVisiveis } from "@/lib/atendimento";
import { db } from "@/lib/db";
import { moeda } from "@/lib/formatar";
import { situacaoCertificado } from "@/lib/certificados";
import { paraDataLocal } from "@/lib/automacao/horario";
import { moverNegocioPeloFormulario } from "../funil/actions";
import {
  alternarEtiqueta,
  cadastrarClienteDaConversa,
  cancelarAgendada,
  criarNegocioDaConversa,
  desvincularCliente,
  vincularClienteExistente,
} from "./actions";
import { FormAgendar, FormSequencia, PainelLateral, SelectAutoEnvio } from "./interativos";

const quando = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Amanhã às 9h (horário de Brasília), para sugerir no agendamento. */
function amanhaAsNove() {
  const amanha = paraDataLocal(new Date(Date.now() + 86_400_000)).slice(0, 10);
  return `${amanha}T09:00`;
}

export async function PainelDetalhes({ eu, conversaId }: { eu: UsuarioAtual; conversaId: string }) {
  const org = eu.organizacao.id;
  const conversa = await db.conversa.findFirst({
    where: { AND: [{ id: conversaId }, conversasVisiveis(eu)] },
    include: {
      etiquetas: { select: { id: true } },
      contato: { select: { nome: true, cargo: true } },
      cliente: {
        include: {
          negocios: {
            orderBy: { criadoEm: "desc" },
            include: { etapa: true, servico: { select: { nome: true } } },
          },
          participantes: {
            include: { matriculas: { where: { certificadoNumero: { not: null } }, include: { turma: { include: { servico: true } } } } },
          },
        },
      },
    },
  });
  if (!conversa) return null;

  const [etiquetas, etapas, servicos, clientes, sequencias, agendadas] = await Promise.all([
    db.etiqueta.findMany({ where: { organizacaoId: org }, orderBy: { nome: "asc" } }),
    db.etapaFunil.findMany({ where: { organizacaoId: org }, orderBy: { ordem: "asc" } }),
    db.servico.findMany({ where: { organizacaoId: org, ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    conversa.cliente ? [] : db.cliente.findMany({ where: { organizacaoId: org }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    db.sequencia.findMany({ where: { organizacaoId: org }, orderBy: { nome: "asc" }, include: { _count: { select: { passos: true } } } }),
    db.mensagemAgendada.findMany({
      where: { conversaId: conversa.id, status: { in: ["PENDENTE", "ENVIANDO", "ERRO"] } },
      orderBy: { enviarEm: "asc" },
      take: 20,
      include: { sequencia: { select: { nome: true } } },
    }),
  ]);
  const marcadas = new Set(conversa.etiquetas.map((e) => e.id));
  const cliente = conversa.cliente;

  // Certificados vencendo ou vencidos: boa hora para oferecer reciclagem.
  const certificados = (cliente?.participantes ?? []).flatMap((p) => p.matriculas.map((m) => ({ m, aluno: p.nome })));
  const reciclagem = certificados.filter(({ m }) => {
    const s = situacaoCertificado(m.validadeAte);
    return s === "vencendo" || s === "vencido";
  });

  return (
    <PainelLateral>
      <Secao titulo="Cliente">
        {cliente ? (
          <div className="space-y-1 text-sm">
            <Link href={`/clientes/${cliente.id}`} className="font-medium text-marca-700 hover:underline">
              {cliente.nome}
            </Link>
            {conversa.contato && (
              <div className="text-xs text-slate-500">
                Falando com {conversa.contato.nome}
                {conversa.contato.cargo && ` (${conversa.contato.cargo})`}
              </div>
            )}
            {(cliente.cidade || cliente.segmento) && (
              <div className="text-xs text-slate-500">{[cliente.segmento, cliente.cidade && `${cliente.cidade}/${cliente.uf ?? ""}`].filter(Boolean).join(" · ")}</div>
            )}
            {certificados.length > 0 && (
              <div className="text-xs text-slate-500">
                {certificados.length} certificado(s) emitido(s)
                {reciclagem.length > 0 && <span className="ml-1 font-medium text-amber-700">· {reciclagem.length} para reciclar</span>}
              </div>
            )}
            <form action={desvincularCliente.bind(null, conversa.id)}>
              <button className="text-[11px] text-slate-400 underline hover:text-slate-700">desvincular deste cliente</button>
            </form>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-amber-700">Este número ainda não está ligado a nenhum cliente.</p>
            <details open className="rounded border border-slate-200 p-2">
              <summary className="cursor-pointer text-xs font-semibold">Cadastrar cliente novo</summary>
              <form action={cadastrarClienteDaConversa.bind(null, conversa.id)} className="mt-2 space-y-2">
                <input name="nome" required defaultValue={conversa.nome ?? ""} placeholder="Empresa ou nome *" aria-label="Nome do cliente" className="campo py-1.5 text-sm" />
                <select name="tipo" defaultValue="PJ" aria-label="Tipo" className="campo py-1.5 text-sm">
                  <option value="PJ">Empresa (PJ)</option>
                  <option value="PF">Pessoa física (PF)</option>
                </select>
                <input name="contatoNome" placeholder="Nome de quem está falando" aria-label="Nome do contato" className="campo py-1.5 text-sm" />
                <div className="flex gap-1">
                  <input name="cidade" placeholder="Cidade" aria-label="Cidade" className="campo py-1.5 text-sm" />
                  <input name="uf" placeholder="UF" maxLength={2} aria-label="UF" className="campo w-14 py-1.5 text-sm" />
                </div>
                <button className="botao w-full py-1.5 text-xs">Cadastrar</button>
              </form>
            </details>
            {clientes.length > 0 && (
              <details className="rounded border border-slate-200 p-2">
                <summary className="cursor-pointer text-xs font-semibold">É de um cliente que já existe</summary>
                <form action={vincularClienteExistente.bind(null, conversa.id)} className="mt-2 space-y-2">
                  <select name="clienteId" required defaultValue="" aria-label="Cliente" className="campo py-1.5 text-sm">
                    <option value="" disabled>Escolha o cliente…</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  <input name="contatoNome" defaultValue={conversa.nome ?? ""} placeholder="Nome de quem está falando" aria-label="Nome do contato" className="campo py-1.5 text-sm" />
                  <button className="botao-secundario w-full py-1.5 text-xs">Vincular</button>
                </form>
              </details>
            )}
          </div>
        )}
      </Secao>

      {cliente && (
        <Secao titulo="Funil de vendas">
          <ul className="space-y-2">
            {cliente.negocios.length === 0 && <li className="text-xs text-slate-500">Nenhum negócio ainda.</li>}
            {cliente.negocios.map((n) => (
              <li key={n.id} className="rounded border border-slate-200 p-2">
                <div className="text-xs font-medium">{n.servico?.nome ?? n.titulo}</div>
                <div className="mb-1 text-[11px] text-slate-500">
                  {moeda(n.valor)}
                  {n.quantidadeAlunos ? ` · ${n.quantidadeAlunos} alunos` : ""}
                </div>
                <form key={n.etapaId} action={moverNegocioPeloFormulario.bind(null, n.id)}>
                  <SelectAutoEnvio
                    name="etapaId"
                    defaultValue={n.etapaId}
                    aria-label={`Etapa de ${n.titulo}`}
                    className="campo py-1 text-xs"
                    style={{ borderLeft: `4px solid ${n.etapa.cor}` }}
                  >
                    {etapas.map((e) => (
                      <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                  </SelectAutoEnvio>
                </form>
              </li>
            ))}
          </ul>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-marca-700">+ Novo negócio</summary>
            <form action={criarNegocioDaConversa.bind(null, conversa.id)} className="mt-2 space-y-2">
              <select name="servicoId" defaultValue="" aria-label="Curso" className="campo py-1.5 text-sm">
                <option value="">Curso…</option>
                {servicos.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
              <div className="flex gap-1">
                <input name="quantidadeAlunos" type="number" min={1} placeholder="Alunos" aria-label="Número de alunos" className="campo py-1.5 text-sm" />
                <input name="valor" placeholder="Valor R$" aria-label="Valor" className="campo py-1.5 text-sm" />
              </div>
              <button className="botao w-full py-1.5 text-xs">Criar no funil</button>
            </form>
          </details>
        </Secao>
      )}

      <Secao titulo="Follow-up e agendamento">
        {agendadas.length > 0 && (
          <ul className="mb-3 space-y-1.5">
            {agendadas.map((a) => (
              <li key={a.id} className={`rounded border p-2 text-xs ${a.status === "ERRO" ? "border-red-200 bg-red-50" : "border-slate-200"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {a.status === "ERRO" ? "⚠ não enviada" : `⏰ ${quando(a.enviarEm)}`}
                    {a.sequencia && <span className="font-normal text-slate-500"> · {a.sequencia.nome}</span>}
                  </span>
                  {a.status === "PENDENTE" && (
                    <form action={cancelarAgendada.bind(null, a.id)}>
                      <button className="text-[11px] text-slate-500 underline hover:text-red-700">cancelar</button>
                    </form>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-slate-600">{a.texto}</p>
                {a.status === "ERRO" && a.motivo && <p className="mt-0.5 text-[11px] text-red-700">{a.motivo}</p>}
              </li>
            ))}
          </ul>
        )}
        {sequencias.length > 0 ? (
          <FormSequencia conversaId={conversa.id} sequencias={sequencias.map((s) => ({ id: s.id, nome: s.nome, passos: s._count.passos }))} />
        ) : (
          <p className="text-xs text-slate-500">
            Nenhuma sequência de follow-up. <Link href="/automacao" className="underline">Criar em Automação</Link>
          </p>
        )}
        <p className="mt-1 text-[11px] text-slate-500">As mensagens param sozinhas se o cliente responder.</p>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-marca-700">+ Agendar uma mensagem</summary>
          <FormAgendar conversaId={conversa.id} sugestao={amanhaAsNove()} />
        </details>
      </Secao>

      <Secao titulo="Etiquetas">
        {etiquetas.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nenhuma etiqueta criada. <Link href="/atendimento/respostas" className="underline">Criar etiquetas</Link>
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {etiquetas.map((e) => {
              const marcada = marcadas.has(e.id);
              return (
                <form key={e.id} action={alternarEtiqueta.bind(null, conversa.id, e.id)}>
                  <button
                    aria-pressed={marcada}
                    className="rounded-full border px-2 py-0.5 text-xs font-medium"
                    style={marcada ? { backgroundColor: e.cor, borderColor: e.cor, color: "white" } : { borderColor: `${e.cor}66`, color: e.cor }}
                  >
                    {marcada ? "✓ " : ""}
                    {e.nome}
                  </button>
                </form>
              );
            })}
          </div>
        )}
      </Secao>
    </PainelLateral>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-200 p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</h2>
      {children}
    </section>
  );
}
