"use client";
// Partes da Central de atendimento que rodam no navegador.
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { enviarMensagem, iniciarConversa, marcarLida } from "./actions";

/**
 * Busca mensagens novas a cada poucos segundos (só com a aba visível).
 * `router.refresh()` pede ao servidor a página de novo sem perder o que
 * está digitado na caixa de mensagem.
 */
export function AtualizacaoAutomatica({ segundos = 5 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => clearInterval(id);
  }, [router, segundos]);
  return null;
}

/** Zera as não lidas quando a conversa é aberta (e quando chegam novas com ela aberta). */
export function MarcarLida({ conversaId, naoLidas }: { conversaId: string; naoLidas: number }) {
  useEffect(() => {
    if (naoLidas > 0) marcarLida(conversaId).catch(() => {});
  }, [conversaId, naoLidas]);
  return null;
}

/** Lista de mensagens que desce sozinha para a última, como no WhatsApp. */
export function RolagemMensagens({ ultimaId, children }: { ultimaId: string | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const perto = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    // Só desce se a pessoa já estava no fim (não atrapalha quem está lendo mensagens antigas).
    if (el && perto.current) el.scrollTop = el.scrollHeight;
  }, [ultimaId]);
  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        perto.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      }}
      className="flex-1 space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-4 md:px-6"
    >
      {children}
    </div>
  );
}

export type RespostaPronta = { atalho: string; texto: string };

/** Caixa de mensagem: Enter envia, Shift+Enter quebra linha, "/" abre as respostas rápidas. */
export function CaixaMensagem({ conversaId, respostas }: { conversaId: string; respostas: RespostaPronta[] }) {
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [indice, setIndice] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const campoArquivo = useRef<HTMLInputElement>(null);

  const [estado, acao, enviando] = useActionState(async (anterior: Awaited<ReturnType<typeof enviarMensagem>> | null, dados: FormData) => {
    const resultado = await enviarMensagem(conversaId, anterior, dados);
    // Limpa a caixa só se enviou (se deu erro, o texto e o arquivo continuam lá).
    if (resultado.ok) {
      setTexto("");
      setArquivo(null);
      if (campoArquivo.current) campoArquivo.current.value = "";
    }
    return resultado;
  }, null);

  // Respostas rápidas: aparecem quando o texto começa com "/".
  const busca = texto.startsWith("/") && !texto.includes("\n") ? texto.slice(1).toLowerCase() : null;
  const sugestoes =
    busca === null
      ? []
      : respostas.filter((r) => r.atalho.toLowerCase().includes(busca) || r.texto.toLowerCase().includes(busca)).slice(0, 6);

  function escolher(r: RespostaPronta) {
    setTexto(r.texto);
    setIndice(0);
  }

  return (
    <form
      ref={form}
      className="relative border-t border-slate-200 bg-white p-2 md:p-3"
      onSubmit={(e) => {
        // Montamos os dados à mão (em vez de action={...}) porque o React limpa
        // o formulário depois do envio, e o arquivo anexado sumiria se desse erro.
        e.preventDefault();
        if (enviando || (!texto.trim() && !arquivo)) return;
        const dados = new FormData();
        dados.set("texto", texto);
        if (arquivo) dados.set("arquivo", arquivo);
        startTransition(() => acao(dados));
      }}
    >
      {sugestoes.length > 0 && (
        <ul className="absolute bottom-full left-2 right-2 mb-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {sugestoes.map((r, i) => (
            <li key={r.atalho}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(r)}
                className={`block w-full px-3 py-2 text-left text-sm ${i === indice ? "bg-marca-50" : "hover:bg-slate-50"}`}
              >
                <span className="font-mono text-xs font-semibold text-marca-700">/{r.atalho}</span>
                <span className="ml-2 line-clamp-1 text-slate-600">{r.texto}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {arquivo && (
        <div className="mb-2 flex items-center justify-between rounded bg-slate-100 px-3 py-1.5 text-xs">
          <span className="truncate">📎 {arquivo.name} ({Math.ceil(arquivo.size / 1024)} KB)</span>
          <button
            type="button"
            className="ml-2 text-slate-500 hover:text-slate-800"
            onClick={() => {
              setArquivo(null);
              if (campoArquivo.current) campoArquivo.current.value = "";
            }}
          >
            remover
          </button>
        </div>
      )}
      {estado?.erro && <p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">{estado.erro}</p>}

      <div className="flex items-end gap-2">
        <label className="cursor-pointer rounded-md px-2 py-2 text-lg text-slate-500 hover:bg-slate-100" title="Anexar foto, vídeo, áudio ou documento">
          📎
          <input
            ref={campoArquivo}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
        </label>
        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setIndice(0);
          }}
          onKeyDown={(e) => {
            if (sugestoes.length > 0) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setIndice((i) => (i + (e.key === "ArrowDown" ? 1 : sugestoes.length - 1)) % sugestoes.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                escolher(sugestoes[indice] ?? sugestoes[0]);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              form.current?.requestSubmit();
            }
          }}
          rows={Math.min(6, Math.max(1, texto.split("\n").length))}
          placeholder={arquivo ? "Legenda (opcional)" : 'Mensagem… (digite "/" para respostas rápidas)'}
          aria-label="Mensagem"
          className="campo min-h-10 flex-1 resize-none"
        />
        <button className="botao h-10" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </form>
  );
}

/** <select> que salva sozinho ao trocar (ex.: etapa do negócio, atendente). */
export function SelectAutoEnvio(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

/**
 * Painel da direita (cliente, funil, etiquetas). No computador grande fica
 * sempre aberto; em telas menores abre por cima com o botão "Detalhes".
 */
export function PainelLateral({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="botao-secundario absolute right-3 top-2.5 z-10 px-2 py-1 text-xs xl:hidden"
      >
        Detalhes
      </button>
      {aberto && <div className="fixed inset-0 z-40 bg-black/30 xl:hidden" onClick={() => setAberto(false)} />}
      <aside
        className={`${aberto ? "fixed inset-y-0 right-0 z-50 flex" : "hidden"} w-80 max-w-[90vw] flex-col overflow-y-auto border-l border-slate-200 bg-white xl:static xl:z-auto xl:flex`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 xl:hidden">
          <span className="text-sm font-semibold">Detalhes</span>
          <button type="button" onClick={() => setAberto(false)} className="text-sm text-slate-500">
            ✕ Fechar
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}

/** Rodapé da lista: abrir conversa com um número que ainda não escreveu. */
export function NovaConversa() {
  const [estado, acao, enviando] = useActionState(iniciarConversa, null);
  return (
    <form action={acao} className="border-t border-slate-200 p-2">
      {estado?.erro && <p className="mb-1 rounded bg-red-50 p-1.5 text-xs text-red-700">{estado.erro}</p>}
      <div className="flex gap-1">
        <input name="numero" inputMode="tel" placeholder="Nova conversa: (31) 9…" aria-label="Número para nova conversa" className="campo py-1.5 text-sm" required />
        <button className="botao-secundario px-2 py-1.5 text-xs" disabled={enviando}>Abrir</button>
      </div>
    </form>
  );
}
