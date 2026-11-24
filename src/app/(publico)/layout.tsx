// Layout das telas públicas (sem login): entrar, criar conta, confirmar e-mail,
// nova senha e termos. Mostra o nome do produto (APP_NOME), não o de uma empresa.
import { nomeDoApp } from "@/lib/url";

export default function LayoutPublico({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-marca-900 px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold tracking-tight text-marca-700">{nomeDoApp()}</div>
          <div className="text-sm text-slate-500">Atendimento, vendas e WhatsApp num lugar só</div>
        </div>
        {children}
      </div>
    </div>
  );
}
