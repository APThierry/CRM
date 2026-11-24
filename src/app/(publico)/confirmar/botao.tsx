"use client";
import { useActionState } from "react";
import { confirmarEmail } from "./actions";

export function BotaoConfirmar({ codigo }: { codigo: string }) {
  const [estado, acao, enviando] = useActionState(confirmarEmail.bind(null, codigo), null);
  return (
    <form action={acao} className="space-y-3">
      {estado?.erro && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{estado.erro}</p>}
      <button className="botao w-full" disabled={enviando}>{enviando ? "Confirmando…" : "Confirmar e entrar"}</button>
    </form>
  );
}
