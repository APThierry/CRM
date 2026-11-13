"use client";
import { useActionState, useEffect, useRef } from "react";
import { criarEtiqueta, criarResposta, type Resultado } from "./actions";

function Mensagem({ estado }: { estado: Resultado }) {
  if (estado?.erro) return <p className="rounded bg-red-50 p-2 text-sm text-red-700">{estado.erro}</p>;
  if (estado?.ok) return <p className="rounded bg-green-50 p-2 text-sm text-green-700">{estado.ok}</p>;
  return null;
}

function useLimpar(estado: Resultado) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado?.ok) ref.current?.reset();
  }, [estado]);
  return ref;
}

export function FormResposta({ podeEquipe }: { podeEquipe: boolean }) {
  const [estado, acao, enviando] = useActionState(criarResposta, null);
  const ref = useLimpar(estado);
  return (
    <form ref={ref} action={acao} className="space-y-3">
      <div className="flex items-center gap-1">
        <span className="font-mono text-slate-500">/</span>
        <input name="atalho" required maxLength={30} placeholder="atalho (ex.: preco-nr35)" aria-label="Atalho" className="campo font-mono" />
      </div>
      <textarea
        name="texto"
        required
        rows={4}
        placeholder="Olá {primeiro_nome}! O treinamento de NR 35 custa…"
        aria-label="Texto da resposta"
        className="campo"
      />
      <p className="text-xs text-slate-500">
        Variáveis: <code>{"{nome}"}</code>, <code>{"{primeiro_nome}"}</code> (de quem está na conversa) e <code>{"{atendente}"}</code> (seu nome).
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="daEquipe" defaultChecked={podeEquipe} disabled={!podeEquipe} />
        Para a equipe toda {!podeEquipe && <span className="text-xs text-slate-500">(só gestor ou administrador)</span>}
      </label>
      <Mensagem estado={estado} />
      <button className="botao" disabled={enviando}>Criar resposta</button>
    </form>
  );
}

const CORES = [
  ["#dc2626", "Vermelho"],
  ["#ea580c", "Laranja"],
  ["#ca8a04", "Amarelo"],
  ["#16a34a", "Verde"],
  ["#0891b2", "Azul-claro"],
  ["#2563eb", "Azul"],
  ["#7c3aed", "Roxo"],
  ["#db2777", "Rosa"],
  ["#64748b", "Cinza"],
] as const;

export function FormEtiqueta() {
  const [estado, acao, enviando] = useActionState(criarEtiqueta, null);
  const ref = useLimpar(estado);
  return (
    <form ref={ref} action={acao} className="space-y-3">
      <input name="nome" required maxLength={30} placeholder="Ex.: Orçamento enviado" aria-label="Nome da etiqueta" className="campo" />
      <fieldset className="flex flex-wrap gap-2">
        <legend className="rotulo">Cor</legend>
        {CORES.map(([cor, nome], i) => (
          <label key={cor} className="cursor-pointer" title={nome}>
            <input type="radio" name="cor" value={cor} defaultChecked={i === 0} className="peer sr-only" />
            <span className="block h-7 w-7 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-slate-800 peer-focus-visible:ring-2" style={{ backgroundColor: cor }} />
            <span className="sr-only">{nome}</span>
          </label>
        ))}
      </fieldset>
      <Mensagem estado={estado} />
      <button className="botao" disabled={enviando}>Criar etiqueta</button>
    </form>
  );
}
