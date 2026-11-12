"use client";
// Formulários com mensagem de resultado (erro/sucesso) sem recarregar a página.
import { useActionState, useEffect, useRef } from "react";
import {
  criarUsuario,
  redefinirSenha,
  salvarPerfil,
  trocarMinhaSenha,
  type Resultado,
} from "./actions";

function Mensagem({ estado }: { estado: Resultado }) {
  if (estado?.erro) return <p className="rounded bg-red-50 p-2 text-sm text-red-700">{estado.erro}</p>;
  if (estado?.ok) return <p className="rounded bg-green-50 p-2 text-sm text-green-700">{estado.ok}</p>;
  return null;
}

/** Limpa o formulário depois de um envio com sucesso. */
function useLimparAoSalvar(estado: Resultado) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado?.ok) ref.current?.reset();
  }, [estado]);
  return ref;
}

export function FormNovoUsuario() {
  const [estado, acao, enviando] = useActionState(criarUsuario, null);
  const ref = useLimparAoSalvar(estado);
  return (
    <form ref={ref} action={acao} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <input name="nome" required placeholder="Nome" className="campo" aria-label="Nome" />
      <input name="email" type="email" required placeholder="E-mail" className="campo" aria-label="E-mail" />
      <select name="papel" defaultValue="VENDEDOR" className="campo" aria-label="Papel">
        <option value="VENDEDOR">Vendedor / Atendente</option>
        <option value="GESTOR">Gestor</option>
        <option value="INSTRUTOR">Instrutor</option>
        <option value="ADMIN">Administrador</option>
      </select>
      <input name="senha" type="password" required minLength={8} autoComplete="new-password" placeholder="Senha inicial" className="campo" aria-label="Senha inicial" />
      <button className="botao" disabled={enviando}>{enviando ? "Criando…" : "Criar usuário"}</button>
      <div className="sm:col-span-2 lg:col-span-5"><Mensagem estado={estado} /></div>
    </form>
  );
}

export function FormRedefinirSenha({ usuarioId }: { usuarioId: string }) {
  const [estado, acao, enviando] = useActionState(redefinirSenha.bind(null, usuarioId), null);
  const ref = useLimparAoSalvar(estado);
  return (
    <form ref={ref} action={acao} className="space-y-1">
      <div className="flex gap-1">
        <input name="senha" type="password" required minLength={8} autoComplete="new-password" placeholder="Nova senha" className="campo py-1 text-xs" aria-label="Nova senha" />
        <button className="botao-secundario px-2 py-1 text-xs" disabled={enviando}>Redefinir</button>
      </div>
      <Mensagem estado={estado} />
    </form>
  );
}

export function FormPerfil({ nome, assinatura }: { nome: string; assinatura: boolean }) {
  const [estado, acao, enviando] = useActionState(salvarPerfil, null);
  return (
    <form action={acao} className="space-y-4">
      <div>
        <label className="rotulo" htmlFor="nome">Nome</label>
        <input id="nome" name="nome" defaultValue={nome} required className="campo" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="assinaturaWhatsapp" defaultChecked={assinatura} className="mt-1" />
        <span>
          Assinar minhas mensagens de WhatsApp com meu nome
          <span className="block text-xs text-slate-500">O cliente vê: <strong>*{nome.split(" ")[0]}:*</strong> Bom dia!</span>
        </span>
      </label>
      <Mensagem estado={estado} />
      <button className="botao" disabled={enviando}>Salvar</button>
    </form>
  );
}

export function FormTrocarSenha() {
  const [estado, acao, enviando] = useActionState(trocarMinhaSenha, null);
  const ref = useLimparAoSalvar(estado);
  return (
    <form ref={ref} action={acao} className="space-y-4">
      <div>
        <label className="rotulo" htmlFor="atual">Senha atual</label>
        <input id="atual" name="atual" type="password" required autoComplete="current-password" className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="nova">Nova senha (mínimo 8 caracteres)</label>
        <input id="nova" name="nova" type="password" required minLength={8} autoComplete="new-password" className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="confirmacao">Repita a nova senha</label>
        <input id="confirmacao" name="confirmacao" type="password" required minLength={8} autoComplete="new-password" className="campo" />
      </div>
      <Mensagem estado={estado} />
      <button className="botao" disabled={enviando}>Trocar senha</button>
    </form>
  );
}
