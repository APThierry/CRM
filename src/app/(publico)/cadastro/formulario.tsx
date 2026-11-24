"use client";
// Formulário "Criar conta". Depois de enviar, mostra o aviso para conferir o e-mail.
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { RAMOS } from "@/lib/cadastro";
import { criarConta } from "./actions";

export function FormularioCadastro({ diasTeste }: { diasTeste: number }) {
  const [estado, acao, enviando] = useActionState(criarConta, null);
  const inicio = useRef<HTMLInputElement>(null);
  // Hora em que o formulário apareceu: robôs costumam enviar no mesmo instante.
  useEffect(() => {
    if (inicio.current && !inicio.current.value) inicio.current.value = String(Date.now());
  }, []);

  if (estado?.enviadoPara) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-lg font-semibold">Confira seu e-mail</h1>
        <p>
          Enviamos um link para <strong>{estado.enviadoPara}</strong>. Abra o link para confirmar que o e-mail é seu e escolher a sua senha.
        </p>
        <p className="text-slate-500">Não chegou em alguns minutos? Olhe a caixa de spam. Se precisar, faça o cadastro de novo daqui a 5 minutos.</p>
        <Link href="/login" className="botao-secundario w-full">Ir para a tela de entrada</Link>
      </div>
    );
  }

  const v = estado?.valores ?? {};
  // `key` com o valor: o React limpa o formulário depois do envio; assim o que foi digitado volta.
  return (
    <form action={acao} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Criar conta grátis</h1>
        <p className="text-sm text-slate-500">{diasTeste} dias de teste, sem cartão de crédito.</p>
      </div>
      <div>
        <label className="rotulo" htmlFor="empresa">Nome da empresa</label>
        <input id="empresa" name="empresa" required maxLength={120} autoFocus defaultValue={v.empresa} key={`a-${v.empresa}`} className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="ramo">Ramo</label>
        <select id="ramo" name="ramo" required defaultValue={v.ramo ?? ""} key={`r-${v.ramo}`} className="campo">
          <option value="" disabled>Escolha…</option>
          {RAMOS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="rotulo" htmlFor="nome">Seu nome</label>
          <input id="nome" name="nome" required maxLength={120} autoComplete="name" defaultValue={v.nome} key={`n-${v.nome}`} className="campo" />
        </div>
        <div>
          <label className="rotulo" htmlFor="telefone">WhatsApp (opcional)</label>
          <input id="telefone" name="telefone" type="tel" maxLength={30} autoComplete="tel" placeholder="(31) 99999-9999" defaultValue={v.telefone} key={`t-${v.telefone}`} className="campo" />
        </div>
      </div>
      <div>
        <label className="rotulo" htmlFor="email">Seu e-mail (é o seu login)</label>
        <input id="email" name="email" type="email" required maxLength={254} autoComplete="username" defaultValue={v.email} key={`e-${v.email}`} className="campo" />
        <p className="mt-1 text-xs text-slate-500">Mandamos um link para ele. A senha você escolhe depois, ao abrir o link.</p>
      </div>

      {/* Armadilha para robôs: escondido de quem usa o site (e dos leitores de tela). */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="site">Não preencha</label>
        <input id="site" name="site" tabIndex={-1} autoComplete="off" />
      </div>
      <input type="hidden" name="inicio" ref={inicio} />

      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input type="checkbox" name="termos" value="sim" required className="mt-1" />
        <span>
          Li e aceito os <Link href="/termos" target="_blank" className="text-marca-700 underline">termos de uso</Link> e a{" "}
          <Link href="/privacidade" target="_blank" className="text-marca-700 underline">política de privacidade</Link>.
        </span>
      </label>

      {estado?.erro && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{estado.erro}</p>}
      <button className="botao w-full" disabled={enviando}>{enviando ? "Criando…" : "Criar conta"}</button>
      <p className="text-center text-sm text-slate-500">
        Já tem conta? <Link href="/login" className="font-medium text-marca-700 hover:underline">Entrar</Link>
      </p>
    </form>
  );
}
