// Termos de uso. TEXTO PROVISÓRIO: precisa ser escrito/revisado por vocês, de
// preferência com um advogado. Ao trocar o texto, troque TERMOS_VERSAO em src/lib/cadastro.ts.
import type { Metadata } from "next";
import Link from "next/link";
import { nomeDoApp } from "@/lib/url";

export const metadata: Metadata = { title: "Termos de uso" };

export default function PaginaTermos() {
  const app = nomeDoApp();
  return (
    <article className="space-y-3 text-sm leading-relaxed text-slate-700">
      <h1 className="text-lg font-semibold text-slate-900">Termos de uso</h1>
      <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">Texto provisório, ainda em revisão.</p>
      <p>Ao criar uma conta no {app}, a empresa cadastrada concorda com estas regras:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>A conta é da empresa. O administrador responde pelos usuários que cadastrar e pelo que eles fazem no sistema.</li>
        <li>Os dados dos clientes cadastrados no {app} pertencem à empresa. Ela é responsável por ter autorização para usá-los, inclusive para mandar mensagens de WhatsApp.</li>
        <li>É proibido usar o {app} para enviar spam, mensagens enganosas ou para pessoas que pediram para não receber. O WhatsApp pode bloquear números que fazem isso, e podemos suspender a conta.</li>
        <li>As campanhas (envio em massa) só ficam disponíveis depois que aprovamos a conta.</li>
        <li>O período de teste é gratuito. Depois dele, o uso depende de contratação. Sem contratação, a conta fica suspensa.</li>
        <li>Podemos suspender contas que descumpram estes termos.</li>
      </ul>
      <p>
        Veja também a <Link href="/privacidade" className="text-marca-700 underline">política de privacidade</Link>.
      </p>
    </article>
  );
}
