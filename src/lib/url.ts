import "server-only";
// Endereço público do CRM e nome do produto.
// - Em produção os links usam SEMPRE o APP_URL (https). Nunca os cabeçalhos da
//   requisição: quem pede "esqueci minha senha" poderia inventar o Host e fazer o
//   link do e-mail apontar para outro site.
// - No desenvolvimento, sem APP_URL, usamos o endereço que o navegador está vendo.
// - APP_NOME aparece nas telas públicas e nos e-mails (padrão: "CRM").
import { headers } from "next/headers";
import { appUrlValida, emProducao } from "@/lib/ambiente";

export const nomeDoApp = () => process.env.APP_NOME?.trim() || "CRM";

export class ErroConfiguracao extends Error {}

/** Lançado só na hora de usar (o build não precisa do APP_URL). */
export async function urlBase() {
  if (emProducao()) {
    const url = appUrlValida(process.env.APP_URL);
    if (!url) throw new ErroConfiguracao("APP_URL não está configurado (precisa ser um endereço https:// válido).");
    return url;
  }
  const fixa = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (fixa) return fixa;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocolo}://${host}`;
}
