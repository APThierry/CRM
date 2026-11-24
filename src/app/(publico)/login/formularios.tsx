"use client";
// Formulários de login e de primeiro acesso (mostram o erro sem recarregar).
import { useActionState } from "react";
import { configurarPrimeiroAcesso, entrar } from "./actions";

export function FormularioLogin() {
  const [estado, acao, enviando] = useActionState(entrar, null);
  return (
    <form action={acao} className="space-y-4">
      <div>
        <label className="rotulo" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} autoFocus defaultValue={estado?.valores?.email} key={estado?.valores?.email} className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="senha">Senha</label>
        <input id="senha" name="senha" type="password" autoComplete="current-password" required maxLength={200} className="campo" />
      </div>
      {estado?.erro && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{estado.erro}</p>}
      <button className="botao w-full" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}

/** `exigeCodigo`: em produção pede o SETUP_TOKEN que está no .env do servidor. */
export function FormularioPrimeiroAcesso({ exigeCodigo }: { exigeCodigo: boolean }) {
  const [estado, acao, enviando] = useActionState(configurarPrimeiroAcesso, null);
  return (
    <form action={acao} className="space-y-4">
      {exigeCodigo && (
        <div>
          <label className="rotulo" htmlFor="codigo">Código de instalação</label>
          <input id="codigo" name="codigo" type="password" required maxLength={200} autoComplete="off" className="campo" />
          <p className="mt-1 text-xs text-slate-500">É o SETUP_TOKEN do arquivo .env do servidor.</p>
        </div>
      )}
      <div>
        <label className="rotulo" htmlFor="nome">Seu nome</label>
        <input id="nome" name="nome" required maxLength={80} autoFocus defaultValue={estado?.valores?.nome} key={`n-${estado?.valores?.nome}`} className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} defaultValue={estado?.valores?.email} key={`e-${estado?.valores?.email}`} className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="senha">Senha (mínimo 8 caracteres)</label>
        <input id="senha" name="senha" type="password" autoComplete="new-password" minLength={8} maxLength={200} required className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="confirmacao">Repita a senha</label>
        <input id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" minLength={8} maxLength={200} required className="campo" />
      </div>
      {estado?.erro && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{estado.erro}</p>}
      <button className="botao w-full" disabled={enviando}>{enviando ? "Criando…" : "Criar administrador e entrar"}</button>
    </form>
  );
}
