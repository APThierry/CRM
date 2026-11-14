"use server";
// Link da agenda (.ics) do usuário logado.
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { desligarAgenda, gerarCodigoAgenda } from "@/lib/agenda";
import { getUsuarioAtual } from "@/lib/auth";

export type ResultadoAgenda = { link?: string; erro?: string } | null;

/** Endereço do CRM como o navegador está vendo (funciona atrás do nginx na VPS). */
async function enderecoBase() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocolo}://${host}`;
}

/** Gera um link novo (o anterior para de funcionar) e mostra uma vez. */
export async function gerarLinkAgenda(_estado: ResultadoAgenda): Promise<ResultadoAgenda> {
  const eu = await getUsuarioAtual();
  const codigo = await gerarCodigoAgenda(eu.id);
  refresh();
  return { link: `${await enderecoBase()}/api/agenda/${codigo}.ics` };
}

export async function desligarLinkAgenda() {
  const eu = await getUsuarioAtual();
  await desligarAgenda(eu.id);
  refresh();
}
