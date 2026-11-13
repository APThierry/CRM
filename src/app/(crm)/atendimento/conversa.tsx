// Coluna do meio: cabeçalho da conversa, mensagens e caixa de envio.
import Link from "next/link";
import type { MensagemWhatsapp } from "@/generated/prisma/client";
import type { UsuarioAtual } from "@/lib/auth";
import { preencherVariaveis, veTodasConversas } from "@/lib/atendimento";
import { db } from "@/lib/db";
import { telefone } from "@/lib/formatar";
import { assumirConversa, finalizarConversa, reabrirConversa, transferirConversa } from "./actions";
import { CaixaMensagem, MarcarLida, RolagemMensagens, SelectAutoEnvio } from "./interativos";
import { linkAtendimento, nomeDaConversa, type Filtros } from "./lista";

const LIMITE = 200; // mensagens mais recentes mostradas

const fuso = { timeZone: "America/Sao_Paulo" } as const;
const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { ...fuso, hour: "2-digit", minute: "2-digit" });
const dia = (d: Date) => d.toLocaleDateString("pt-BR", { ...fuso, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });

export async function PainelConversa({ eu, conversaId, filtros }: { eu: UsuarioAtual; conversaId: string; filtros: Filtros }) {
  const conversa = await db.conversa.findFirst({
    where: { id: conversaId, organizacaoId: eu.organizacao.id },
    include: {
      cliente: { select: { id: true, nome: true } },
      contato: { select: { nome: true } },
      atendente: { select: { id: true, nome: true } },
    },
  });
  if (!conversa) return <Aviso>Conversa não encontrada.</Aviso>;
  const podeVer = veTodasConversas(eu.papel) || !conversa.atendenteId || conversa.atendenteId === eu.id;
  if (!podeVer) return <Aviso>Esta conversa está com {conversa.atendente?.nome}. Peça a um gestor para transferir.</Aviso>;

  const [mensagens, atendentes, respostas] = await Promise.all([
    db.mensagemWhatsapp
      .findMany({
        where: { conversaId: conversa.id },
        // O WhatsApp manda a hora em segundos: mensagens no mesmo segundo
        // ficam na ordem em que chegaram (o id cresce com o tempo).
        orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
        take: LIMITE,
        include: { usuario: { select: { nome: true } } },
      })
      .then((l) => l.reverse()),
    db.usuario.findMany({ where: { organizacaoId: eu.organizacao.id, ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    db.respostaRapida.findMany({
      where: { organizacaoId: eu.organizacao.id, OR: [{ usuarioId: null }, { usuarioId: eu.id }] },
      orderBy: { atalho: "asc" },
    }),
  ]);

  const nome = nomeDaConversa(conversa);
  const nomeParaResposta = conversa.contato?.nome ?? conversa.nome ?? (conversa.cliente?.nome ?? "");
  const minha = conversa.atendenteId === eu.id;
  const podeTransferir = veTodasConversas(eu.papel) || minha;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <MarcarLida conversaId={conversa.id} naoLidas={conversa.naoLidas} />

      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-white px-3 py-2 pr-24 xl:pr-3">
        <Link href={linkAtendimento(filtros, { c: null })} className="text-slate-500 md:hidden" aria-label="Voltar para a lista">
          ←
        </Link>
        <div className="min-w-0">
          <div className="truncate font-semibold">{nome}</div>
          <div className="text-xs text-slate-500">
            {telefone(conversa.telefone)}
            {conversa.status === "FINALIZADA" && <span className="ml-2 font-medium text-slate-600">· finalizada</span>}
            {conversa.botEtapa === "MENU" && <span className="ml-2 text-marca-700">· 🤖 chatbot esperando a escolha</span>}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          {!conversa.atendenteId ? (
            <form action={assumirConversa.bind(null, conversa.id)}>
              <button className="botao px-2 py-1 text-xs">Assumir</button>
            </form>
          ) : podeTransferir ? (
            <form key={conversa.atendenteId} action={transferirConversa.bind(null, conversa.id)} className="flex items-center gap-1">
              <span className="text-slate-500">Atendente:</span>
              <SelectAutoEnvio name="atendenteId" defaultValue={conversa.atendenteId} aria-label="Atendente" className="campo w-auto py-1 text-xs">
                <option value="">Devolver para a fila</option>
                {atendentes.map((a) => (
                  <option key={a.id} value={a.id}>{a.id === eu.id ? `${a.nome} (você)` : a.nome}</option>
                ))}
              </SelectAutoEnvio>
            </form>
          ) : (
            <span className="text-slate-500">Atendente: {conversa.atendente?.nome}</span>
          )}
          {conversa.status === "ABERTA" ? (
            <form action={finalizarConversa.bind(null, conversa.id)}>
              <button className="botao-secundario px-2 py-1 text-xs" title="Tira a conversa das abertas. Se o cliente escrever de novo, ela volta.">
                ✓ Finalizar
              </button>
            </form>
          ) : (
            <form action={reabrirConversa.bind(null, conversa.id)}>
              <button className="botao-secundario px-2 py-1 text-xs">Reabrir</button>
            </form>
          )}
        </div>
      </header>

      <RolagemMensagens ultimaId={mensagens.at(-1)?.id ?? null}>
        {mensagens.length === LIMITE && (
          <p className="text-center text-xs text-slate-500">Mostrando as {LIMITE} mensagens mais recentes.</p>
        )}
        {mensagens.length === 0 && (
          <p className="mx-auto mt-10 max-w-xs rounded-lg bg-white/80 p-4 text-center text-sm text-slate-600">
            Nenhuma mensagem ainda. Escreva abaixo para começar a conversa.
          </p>
        )}
        {mensagens.map((m, i) => {
          const novoDia = i === 0 || dia(mensagens[i - 1].criadoEm) !== dia(m.criadoEm);
          return (
            <div key={m.id}>
              {novoDia && (
                <div className="my-3 text-center">
                  <span className="rounded-md bg-white/90 px-3 py-1 text-[11px] uppercase text-slate-500 shadow-sm">{dia(m.criadoEm)}</span>
                </div>
              )}
              <Balao m={m} autor={m.usuario?.nome ?? null} />
            </div>
          );
        })}
      </RolagemMensagens>

      <CaixaMensagem
        conversaId={conversa.id}
        respostas={respostas.map((r) => ({
          atalho: r.atalho,
          texto: preencherVariaveis(r.texto, { nome: nomeParaResposta, atendente: eu.nome }),
        }))}
      />
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">{children}</div>;
}

function Balao({ m, autor }: { m: MensagemWhatsapp; autor: string | null }) {
  const saida = m.direcao === "SAIDA";
  const url = m.arquivo ? `/api/arquivos/${m.arquivo}${m.nomeArquivo ? `?nome=${encodeURIComponent(m.nomeArquivo)}` : ""}` : null;
  const legendaPadrao = /^(📷 Imagem|🎥 Vídeo|🎤 Áudio|Figurinha|📎 .*)$/.test(m.conteudo);

  return (
    <div className={`flex ${saida ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-sm md:max-w-[70%] ${saida ? "bg-[#d9fdd3]" : "bg-white"}`}>
        {url && m.tipo === "IMAGEM" && (
          <a href={url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- arquivo privado, servido pela nossa rota */}
            <img src={url} alt="Imagem recebida" className="mb-1 max-h-72 rounded" loading="lazy" />
          </a>
        )}
        {url && m.tipo === "FIGURINHA" && (
          // eslint-disable-next-line @next/next/no-img-element -- arquivo privado, servido pela nossa rota
          <img src={url} alt="Figurinha" className="h-32 w-32 object-contain" loading="lazy" />
        )}
        {url && m.tipo === "AUDIO" && <audio controls src={url} className="my-1 w-64 max-w-full" preload="none" />}
        {url && m.tipo === "VIDEO" && <video controls src={url} className="mb-1 max-h-72 rounded" preload="metadata" />}
        {url && m.tipo === "DOCUMENTO" && (
          <a href={url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded bg-black/5 px-3 py-2 hover:bg-black/10">
            <span className="text-xl">📄</span>
            <span className="truncate font-medium">{m.nomeArquivo ?? "Documento"}</span>
          </a>
        )}
        {!url && m.tipo !== "TEXTO" && m.tipo !== "OUTRO" && <span className="text-xs italic text-slate-500">(arquivo não disponível) </span>}
        {(!url || !legendaPadrao) && <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>}
        <div className="mt-0.5 text-right text-[10px] text-slate-500">
          {saida &&
            (autor
              ? `${autor.split(" ")[0]}${m.status === "agendada" ? " (agendada)" : ""} · `
              : m.status === "enviada pelo celular"
                ? "pelo celular · "
                : m.status === "automática"
                  ? "🤖 automática · "
                  : m.status === "campanha"
                    ? "📣 campanha · "
                    : "")}
          {hora(m.criadoEm)}
          {m.status === "erro" && <span className="ml-1 text-red-600">falhou</span>}
        </div>
      </div>
    </div>
  );
}
