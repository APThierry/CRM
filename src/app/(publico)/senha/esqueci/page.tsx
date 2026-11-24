// "Esqueci minha senha": pede o e-mail e manda o link.
import type { Metadata } from "next";
import { FormularioEsqueci } from "../formularios";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function PaginaEsqueci() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Esqueci minha senha</h1>
      <p className="mb-4 text-sm text-slate-500">Digite o e-mail que você usa para entrar. Enviamos um link para criar uma senha nova.</p>
      <FormularioEsqueci />
    </>
  );
}
