// Política de privacidade. TEXTO PROVISÓRIO: precisa ser escrito/revisado por
// vocês, de preferência com um advogado (LGPD). Ao trocar o texto, troque
// TERMOS_VERSAO em src/lib/cadastro.ts.
import type { Metadata } from "next";
import Link from "next/link";
import { nomeDoApp } from "@/lib/url";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PaginaPrivacidade() {
  const app = nomeDoApp();
  return (
    <article className="space-y-3 text-sm leading-relaxed text-slate-700">
      <h1 className="text-lg font-semibold text-slate-900">Política de privacidade</h1>
      <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">Texto provisório, ainda em revisão.</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>O que guardamos da sua empresa:</strong> nome, ramo, telefone, e o nome e o e-mail dos usuários. Usamos isso para manter a conta, mandar
          avisos (confirmação de e-mail, senha nova) e falar com vocês.
        </li>
        <li>
          <strong>Dados dos seus clientes:</strong> clientes, conversas de WhatsApp, negócios e arquivos ficam guardados no {app} em nome da sua empresa. Nós só
          os tratamos para fazer o sistema funcionar (LGPD: a sua empresa é a controladora, e nós somos operadores). Uma empresa nunca vê os dados de outra.
        </li>
        <li>
          <strong>Segurança:</strong> senhas e códigos de acesso são guardados só em forma cifrada (hash). O acesso ao servidor é restrito.
        </li>
        <li>
          <strong>Saída:</strong> a sua empresa pode exportar os dados em planilha e pedir a exclusão da conta.
        </li>
      </ul>
      <p>
        Veja também os <Link href="/termos" className="text-marca-700 underline">termos de uso</Link>.
      </p>
    </article>
  );
}
