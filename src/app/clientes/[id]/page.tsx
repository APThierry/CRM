// Ficha do cliente: dados, contatos, negócios, certificados e histórico.
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando, Etiqueta, Vazio } from "@/components/ui";
import { db } from "@/lib/db";
import { data, dataHora, linkWhatsapp, moeda, normalizarWhatsapp, telefone } from "@/lib/formatar";
import { getOrganizacaoAtual } from "@/lib/org";
import { estadoConexao } from "@/lib/whatsapp/evolution";
import { adicionarAtividade, alternarConclusao } from "../actions";
import { ConversaWhatsapp } from "./conversa-whatsapp";

const nomesTipo: Record<string, string> = {
  NOTA: "📝 Nota",
  LIGACAO: "📞 Ligação",
  WHATSAPP: "💬 WhatsApp",
  EMAIL: "✉️ E-mail",
  REUNIAO: "👥 Reunião",
  VISITA: "📍 Visita",
  TAREFA: "☑️ Tarefa",
};

export default function PaginaCliente({ params }: PageProps<"/clientes/[id]">) {
  return (
    <Suspense fallback={<Carregando />}>
      <FichaCliente params={params} />
    </Suspense>
  );
}

async function FichaCliente({ params }: { params: PageProps<"/clientes/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const org = await getOrganizacaoAtual();

  const cliente = await db.cliente.findFirst({
    where: { id, organizacaoId: org.id },
    include: {
      contatos: { orderBy: { principal: "desc" } },
      negocios: { include: { etapa: true, servico: true }, orderBy: { criadoEm: "desc" } },
      mensagens: { orderBy: { criadoEm: "desc" }, take: 50 },
      atividades: { orderBy: [{ concluida: "asc" }, { criadoEm: "desc" }], take: 50 },
      participantes: {
        include: { matriculas: { include: { turma: { include: { servico: true } } } } },
      },
    },
  });
  if (!cliente) notFound();

  const zap = linkWhatsapp(cliente.whatsapp ?? cliente.contatos[0]?.whatsapp, `Olá! Aqui é da ${org.nome}.`);
  const certificados = cliente.participantes.flatMap((p) => p.matriculas.map((m) => ({ ...m, participante: p.nome })));
  const hoje = new Date();
  const acaoAtividade = adicionarAtividade.bind(null, cliente.id);
  const whatsapp = await estadoConexao();

  // Números de WhatsApp do cliente e dos contatos, sem repetir.
  const numeros = new Map<string, string>();
  const addNumero = (n: string | null, quem: string) => {
    const v = normalizarWhatsapp(n);
    if (v && !numeros.has(v)) numeros.set(v, `${quem} · ${telefone(v)}`);
  };
  addNumero(cliente.whatsapp, cliente.nomeFantasia ?? "Cliente");
  cliente.contatos.forEach((c) => addNumero(c.whatsapp, c.nome));

  return (
    <>
      <Cabecalho
        titulo={cliente.nome}
        subtitulo={[cliente.segmento, cliente.cidade && `${cliente.cidade}/${cliente.uf ?? ""}`, cliente.origem && `Origem: ${cliente.origem}`]
          .filter(Boolean)
          .join(" · ")}
        acoes={
          <>
            {zap && (
              <a href={zap} target="_blank" rel="noreferrer" className="botao bg-green-600 hover:bg-green-700">
                💬 Abrir no WhatsApp
              </a>
            )}
            <Link href={`/turmas/nova?cliente=${cliente.id}`} className="botao-secundario">+ Agendar turma</Link>
            <Link href="/clientes" className="botao-secundario">Voltar</Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <section className="cartao p-4 text-sm">
            <h2 className="mb-3 font-semibold">Dados</h2>
            <dl className="space-y-2">
              {[
                ["Tipo", cliente.tipo === "PJ" ? "Empresa" : "Pessoa física"],
                ["CNPJ/CPF", cliente.documento],
                ["Telefone", cliente.telefone],
                ["WhatsApp", telefone(cliente.whatsapp)],
                ["E-mail", cliente.email],
                ["Cadastrado em", data(cliente.criadoEm)],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{rotulo}</dt>
                  <dd className="text-right">{valor || "—"}</dd>
                </div>
              ))}
            </dl>
            {cliente.observacoes && <p className="mt-3 rounded bg-slate-50 p-2 text-slate-600">{cliente.observacoes}</p>}
          </section>

          <section className="cartao p-4 text-sm">
            <h2 className="mb-3 font-semibold">Contatos</h2>
            {cliente.contatos.length === 0 ? (
              <p className="text-slate-500">Nenhum contato.</p>
            ) : (
              <ul className="space-y-3">
                {cliente.contatos.map((c) => (
                  <li key={c.id}>
                    <div className="font-medium">
                      {c.nome} {c.principal && <Etiqueta>principal</Etiqueta>}
                    </div>
                    <div className="text-xs text-slate-500">{c.cargo}</div>
                    {c.whatsapp && <div className="text-xs text-green-700">{telefone(c.whatsapp)}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cartao p-4 text-sm">
            <h2 className="mb-3 font-semibold">Certificados</h2>
            {certificados.length === 0 ? (
              <p className="text-slate-500">Nenhum aluno treinado ainda.</p>
            ) : (
              <ul className="space-y-2">
                {certificados.map((m) => {
                  const vencido = m.validadeAte && m.validadeAte < hoje;
                  return (
                    <li key={m.id} className="flex justify-between gap-2">
                      <div>
                        <div>{m.participante}</div>
                        <div className="text-xs text-slate-500">{m.turma.servico.nome}</div>
                      </div>
                      <div className={`whitespace-nowrap text-xs ${vencido ? "font-medium text-red-600" : "text-slate-500"}`}>
                        {vencido ? "venceu " : "até "}
                        {data(m.validadeAte)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <section className="cartao p-4 text-sm">
            <h2 className="mb-3 font-semibold">Negócios</h2>
            {cliente.negocios.length === 0 ? (
              <Vazio>Nenhum negócio. <Link href="/funil" className="underline">Abrir o funil</Link></Vazio>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cliente.negocios.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <div className="font-medium">{n.titulo}</div>
                      <div className="text-xs text-slate-500">
                        {n.servico?.nome}
                        {n.quantidadeAlunos ? ` · ${n.quantidadeAlunos} alunos` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{moeda(n.valor)}</span>
                      <Etiqueta cor={n.etapa.cor}>{n.etapa.nome}</Etiqueta>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="whatsapp" className="cartao p-4 text-sm">
            <h2 className="mb-3 font-semibold">💬 WhatsApp</h2>
            <ConversaWhatsapp
              clienteId={cliente.id}
              conectado={whatsapp.estado === "open"}
              numeros={[...numeros].map(([valor, rotulo]) => ({ valor, rotulo }))}
              mensagens={cliente.mensagens
                .toReversed()
                .map((m) => ({ id: m.id, direcao: m.direcao, conteudo: m.conteudo, status: m.status, quando: dataHora(m.criadoEm) }))}
            />
          </section>

          <section className="cartao p-4 text-sm">
            <h2 className="mb-3 font-semibold">Histórico e tarefas</h2>
            <form action={acaoAtividade} className="mb-4 grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-[140px_1fr_150px_auto]">
              <select name="tipo" className="campo" aria-label="Tipo">
                {Object.entries(nomesTipo).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>{rotulo}</option>
                ))}
              </select>
              <input name="descricao" required placeholder="O que aconteceu ou o que precisa ser feito?" className="campo" aria-label="Descrição" />
              <input name="agendadaPara" type="date" className="campo" aria-label="Data da tarefa (opcional)" title="Data da tarefa (opcional)" />
              <button className="botao">Adicionar</button>
            </form>

            {cliente.atividades.length === 0 ? (
              <p className="text-slate-500">Nada registrado ainda.</p>
            ) : (
              <ul className="space-y-2">
                {cliente.atividades.map((a) => (
                  <li key={a.id} className={`flex items-start gap-3 rounded-md border border-slate-100 p-3 ${a.concluida ? "opacity-60" : ""}`}>
                    {a.agendadaPara ? (
                      <form action={alternarConclusao.bind(null, a.id)}>
                        <button
                          title={a.concluida ? "Reabrir" : "Concluir"}
                          className={`mt-0.5 h-4 w-4 rounded border ${a.concluida ? "border-green-600 bg-green-600" : "border-slate-400"}`}
                        />
                      </form>
                    ) : (
                      <span className="mt-0.5 h-4 w-4" />
                    )}
                    <div className="flex-1">
                      <div className={a.concluida ? "line-through" : ""}>{a.descricao}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {nomesTipo[a.tipo]} · registrado {dataHora(a.criadoEm)}
                        {a.agendadaPara && <span className="font-medium text-amber-700"> · para {data(a.agendadaPara)}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
