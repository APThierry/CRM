import "server-only";
// Endereço público do CRM e nome do produto.
// - APP_URL (ex.: https://crm.seudominio.com.br) é o mais seguro: os links dos
//   e-mails usam ele. Sem APP_URL, usamos o endereço que o navegador está vendo
//   (na VPS o Caddy repassa o Host e o X-Forwarded-Proto).
// - APP_NOME aparece nas telas públicas e nos e-mails (padrão: "CRM").
import { headers } from "next/headers";

export const nomeDoApp = () => process.env.APP_NOME?.trim() || "CRM";

export async function urlBase() {
  const fixa = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (fixa) return fixa;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocolo}://${host}`;
}
