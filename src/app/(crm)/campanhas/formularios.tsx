"use client";
// Formulários das campanhas (mostram erro/ok sem recarregar a página).
import { useActionState } from "react";
import type { FiltroPublico } from "@/lib/campanhas/publico";
import { criarCampanha, enviarTeste, salvarReciclagem, salvarTexto, type Resultado } from "./actions";

function Aviso({ estado }: { estado: Resultado }) {
  if (estado?.erro) return <p className="rounded bg-red-50 p-2 text-sm text-red-700">{estado.erro}</p>;
  if (estado?.ok) return <p className="rounded bg-green-50 p-2 text-sm text-green-700">{estado.ok}</p>;
  return null;
}

export const AJUDA_TEXTO =
  "Variações: {Olá|Oi|Bom dia} (cada cliente recebe uma, sorteada). Variáveis: {primeiro_nome}, {nome}, {empresa}. " +
  "O convite para responder SAIR é colocado no fim automaticamente.";

const TEXTO_EXEMPLO =
  "{Olá|Oi}{, primeiro_nome}! Aqui é da {empresa}. Estamos com turmas abertas de brigada de incêndio (NR 23 / IT 12) neste mês. Quer que eu te mande as datas?";

export function FormNovaCampanha({ filtro, quantidade }: { filtro: FiltroPublico; quantidade: number }) {
  const [estado, acao, enviando] = useActionState(criarCampanha, null);
  return (
    <form action={acao} className="space-y-3">
      {/* O público escolhido acima vai junto, escondido. */}
      {Object.entries(filtro).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={String(v)} /> : null))}
      <div>
        <label className="rotulo" htmlFor="nome">Nome da campanha *</label>
        <input id="nome" name="nome" required maxLength={80} placeholder="Ex.: Turmas de dezembro" className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="texto">Mensagem *</label>
        <textarea id="texto" name="texto" required rows={6} maxLength={2000} defaultValue={TEXTO_EXEMPLO} className="campo" />
        <p className="mt-1 text-xs text-slate-500">{AJUDA_TEXTO}</p>
      </div>
      <Aviso estado={estado} />
      <button className="botao" disabled={enviando || quantidade === 0}>
        {enviando ? "Criando…" : `Criar rascunho para ${quantidade} cliente(s)`}
      </button>
      <p className="text-xs text-slate-500">Nada é enviado agora. Você revisa, manda um teste e só então inicia.</p>
    </form>
  );
}

export function FormTexto({ id, texto }: { id: string; texto: string }) {
  const [estado, acao, enviando] = useActionState(salvarTexto.bind(null, id), null);
  return (
    <form action={acao} className="space-y-2">
      <textarea name="texto" rows={6} maxLength={2000} defaultValue={texto} className="campo" aria-label="Mensagem" />
      <p className="text-xs text-slate-500">{AJUDA_TEXTO}</p>
      <Aviso estado={estado} />
      <button className="botao-secundario" disabled={enviando}>{enviando ? "Salvando…" : "Salvar texto"}</button>
    </form>
  );
}

export function FormTeste({ id }: { id: string }) {
  const [estado, acao, enviando] = useActionState(enviarTeste.bind(null, id), null);
  return (
    <form action={acao} className="space-y-2">
      <div className="flex gap-2">
        <input name="numero" required inputMode="tel" placeholder="Seu WhatsApp: (31) 99999-9999" className="campo" aria-label="Número para o teste" />
        <button className="botao-secundario whitespace-nowrap" disabled={enviando}>{enviando ? "Enviando…" : "Enviar teste"}</button>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

export function FormReciclagem({ dias, texto }: { dias: number; texto: string }) {
  const [estado, acao, enviando] = useActionState(salvarReciclagem, null);
  return (
    <form action={acao} className="space-y-3">
      <div className="max-w-xs">
        <label className="rotulo" htmlFor="reciclagemDias">Avisar quantos dias antes do vencimento?</label>
        <input id="reciclagemDias" name="reciclagemDias" type="number" min={7} max={365} defaultValue={dias} className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="reciclagemTexto">Mensagem de reciclagem</label>
        <textarea id="reciclagemTexto" name="reciclagemTexto" rows={4} maxLength={2000} defaultValue={texto} className="campo" />
        <p className="mt-1 text-xs text-slate-500">
          Além das de sempre: {"{cliente}"} (empresa do cliente), {"{curso}"} (cursos e nº de alunos) e {"{vencimento}"} (primeira data).
        </p>
      </div>
      <Aviso estado={estado} />
      <button className="botao-secundario" disabled={enviando}>{enviando ? "Salvando…" : "Salvar"}</button>
    </form>
  );
}
