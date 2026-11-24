"use client";
import Link from "next/link";
import { useActionState } from "react";
import { definirNovaSenha, pedirNovaSenha } from "./actions";

export function FormularioEsqueci() {
  const [estado, acao, enviando] = useActionState(pedirNovaSenha, null);
  if (estado?.ok) {
    return (
      <div className="space-y-3 text-sm">
        <p className="rounded bg-green-50 p-3 text-green-800">{estado.ok}</p>
        <p className="text-slate-500">Não chegou? Olhe a caixa de spam ou peça de novo daqui a 5 minutos.</p>
        <Link href="/login" className="botao-secundario w-full">Voltar para a tela de entrada</Link>
      </div>
    );
  }
  return (
    <form action={acao} className="space-y-4">
      <div>
        <label className="rotulo" htmlFor="email">Seu e-mail</label>
        <input id="email" name="email" type="email" required autoFocus autoComplete="username" defaultValue={estado?.email} className="campo" />
      </div>
      {estado?.erro && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{estado.erro}</p>}
      <button className="botao w-full" disabled={enviando}>{enviando ? "Enviando…" : "Enviar link"}</button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-marca-700 hover:underline">Voltar para a tela de entrada</Link>
      </p>
    </form>
  );
}

export function FormularioNovaSenha({ codigo }: { codigo: string }) {
  const [estado, acao, enviando] = useActionState(definirNovaSenha.bind(null, codigo), null);
  if (estado?.ok) {
    return (
      <div className="space-y-3 text-sm">
        <p className="rounded bg-amber-50 p-3 text-amber-800">{estado.ok}</p>
        <Link href="/login" className="botao-secundario w-full">Ir para a tela de entrada</Link>
      </div>
    );
  }
  return (
    <form action={acao} className="space-y-4">
      <div>
        <label className="rotulo" htmlFor="senha">Senha nova (mínimo 8 caracteres)</label>
        <input id="senha" name="senha" type="password" required minLength={8} autoFocus autoComplete="new-password" className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="confirmacao">Repita a senha nova</label>
        <input id="confirmacao" name="confirmacao" type="password" required minLength={8} autoComplete="new-password" className="campo" />
      </div>
      {estado?.erro && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{estado.erro}</p>}
      <button className="botao w-full" disabled={enviando}>{enviando ? "Salvando…" : "Salvar senha e entrar"}</button>
    </form>
  );
}
