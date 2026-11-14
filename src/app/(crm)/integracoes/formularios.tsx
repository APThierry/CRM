"use client";
// Formulários dos webhooks (mostram erro/ok sem recarregar a página).
import { useActionState } from "react";
import { EVENTOS } from "@/lib/webhooks/eventos";
import { criarWebhook, salvarEventos, testarWebhook, type Resultado } from "./actions";

function Aviso({ estado }: { estado: Resultado }) {
  if (estado?.erro) return <p className="rounded bg-red-50 p-2 text-sm text-red-700">{estado.erro}</p>;
  if (estado?.ok) return <p className="rounded bg-green-50 p-2 text-sm text-green-700">{estado.ok}</p>;
  return null;
}

function CaixasEventos({ marcados }: { marcados: string[] }) {
  return (
    <fieldset>
      <legend className="rotulo">Eventos</legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {Object.entries(EVENTOS).map(([chave, rotulo]) => (
          <label key={chave} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="eventos" value={chave} defaultChecked={marcados.includes(chave)} className="mt-1" />
            <span>
              {rotulo} <code className="text-xs text-slate-400">{chave}</code>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FormNovoWebhook() {
  const [estado, acao, enviando] = useActionState(criarWebhook, null);
  return (
    <form action={acao} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="rotulo" htmlFor="nome">Nome *</label>
          <input id="nome" name="nome" required maxLength={80} placeholder="Ex.: n8n, Planilha de vendas" className="campo" />
        </div>
        <div>
          <label className="rotulo" htmlFor="url">Endereço (URL) *</label>
          <input id="url" name="url" type="url" required placeholder="https://..." className="campo" />
        </div>
      </div>
      <CaixasEventos marcados={["negocio.ganho"]} />
      <Aviso estado={estado} />
      <button className="botao" disabled={enviando}>{enviando ? "Criando…" : "Criar webhook"}</button>
    </form>
  );
}

export function FormEditarWebhook({ id, url, eventos }: { id: string; url: string; eventos: string[] }) {
  const [estado, acao, enviando] = useActionState(salvarEventos.bind(null, id), null);
  return (
    <form action={acao} className="space-y-3">
      <div>
        <label className="rotulo" htmlFor={`url-${id}`}>Endereço (URL)</label>
        <input id={`url-${id}`} name="url" type="url" required defaultValue={url} className="campo" />
      </div>
      <CaixasEventos marcados={eventos} />
      <Aviso estado={estado} />
      <button className="botao-secundario" disabled={enviando}>{enviando ? "Salvando…" : "Salvar"}</button>
    </form>
  );
}

export function BotaoTestar({ id }: { id: string }) {
  const [estado, acao, enviando] = useActionState(testarWebhook.bind(null, id), null);
  return (
    <form action={acao} className="space-y-2">
      <button className="botao-secundario" disabled={enviando}>{enviando ? "Testando…" : "Enviar teste"}</button>
      <Aviso estado={estado} />
    </form>
  );
}
