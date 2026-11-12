"use client";
// Conversa de WhatsApp na ficha do cliente: mensagens e formulário de envio.
// A lista se atualiza sozinha a cada 10 segundos para mostrar respostas novas.
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { enviarParaCliente } from "@/app/(crm)/whatsapp/actions";

export type MensagemTela = {
  id: string;
  direcao: "ENTRADA" | "SAIDA";
  conteudo: string;
  quando: string;
  status: string | null;
  autor: string | null; // atendente que enviou pelo CRM
};

const modelos = [
  "Olá! Tudo bem? Aqui é da Brigada MG.",
  "Olá! Segue a proposta do treinamento conforme conversamos.",
  "Olá! Os certificados da sua equipe estão próximos do vencimento. Vamos agendar a reciclagem?",
];

export function ConversaWhatsapp({
  clienteId,
  mensagens,
  numeros,
  conectado,
}: {
  clienteId: string;
  mensagens: MensagemTela[];
  numeros: { valor: string; rotulo: string }[];
  conectado: boolean;
}) {
  const router = useRouter();
  const [estado, enviar, enviando] = useActionState(enviarParaCliente.bind(null, clienteId), null);
  const formulario = useRef<HTMLFormElement>(null);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    if (estado?.ok) formulario.current?.reset();
  }, [estado]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "nearest" });
  }, [mensagens.length]);

  return (
    <div>
      <div className="max-h-96 space-y-2 overflow-y-auto rounded-md bg-[#efeae2] p-3">
        {mensagens.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">Nenhuma mensagem com este cliente ainda.</p>
        ) : (
          mensagens.map((m) => (
            <div key={m.id} className={`flex ${m.direcao === "SAIDA" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 shadow-sm ${m.direcao === "SAIDA" ? "bg-[#d9fdd3]" : "bg-white"}`}>
                <div className="whitespace-pre-wrap break-words">{m.conteudo}</div>
                <div className="mt-1 text-right text-[10px] text-slate-500">
                  {m.autor ? `${m.autor.split(" ")[0]} · ` : ""}
                  {m.quando}
                  {m.direcao === "SAIDA" && m.status === "enviada pelo celular" ? " · pelo celular" : ""}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={fim} />
      </div>

      {!conectado ? (
        <p className="mt-3 rounded bg-amber-50 p-3 text-xs text-amber-800">
          O WhatsApp não está conectado. <a href="/whatsapp" className="underline">Conectar agora</a>
        </p>
      ) : numeros.length === 0 ? (
        <p className="mt-3 rounded bg-amber-50 p-3 text-xs text-amber-800">Cadastre um número de WhatsApp para este cliente.</p>
      ) : (
        <form ref={formulario} action={enviar} className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {numeros.length > 1 && (
              <select name="numero" className="campo w-auto" aria-label="Enviar para">
                {numeros.map((n) => <option key={n.valor} value={n.valor}>{n.rotulo}</option>)}
              </select>
            )}
            {numeros.length === 1 && <input type="hidden" name="numero" value={numeros[0].valor} />}
            <select
              className="campo w-auto text-slate-500"
              aria-label="Modelo de mensagem"
              defaultValue=""
              onChange={(e) => {
                const campo = formulario.current?.elements.namedItem("texto") as HTMLTextAreaElement | null;
                if (campo && e.target.value) campo.value = e.target.value;
                e.target.value = "";
              }}
            >
              <option value="">Usar um modelo…</option>
              {modelos.map((m) => <option key={m} value={m}>{m.slice(0, 50)}…</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <textarea name="texto" required rows={2} placeholder="Escreva a mensagem…" className="campo" />
            <button className="botao bg-green-600 hover:bg-green-700" disabled={enviando}>
              {enviando ? "Enviando…" : "Enviar"}
            </button>
          </div>
          {estado?.erro && <p className="text-xs text-red-600">{estado.erro}</p>}
        </form>
      )}
    </div>
  );
}
