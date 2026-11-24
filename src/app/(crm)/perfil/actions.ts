"use server";
// Link da agenda (.ics) do usuário logado.
import { refresh } from "next/cache";
import { desligarAgenda, gerarCodigoAgenda } from "@/lib/agenda";
import { getUsuarioAtual } from "@/lib/auth";
import { urlBase } from "@/lib/url";

export type ResultadoAgenda = { link?: string; erro?: string } | null;

/** Gera um link novo (o anterior para de funcionar) e mostra uma vez. */
export async function gerarLinkAgenda(_estado: ResultadoAgenda): Promise<ResultadoAgenda> {
  const eu = await getUsuarioAtual();
  const codigo = await gerarCodigoAgenda(eu.id);
  refresh();
  return { link: `${await urlBase()}/api/agenda/${codigo}.ics` };
}

export async function desligarLinkAgenda() {
  const eu = await getUsuarioAtual();
  await desligarAgenda(eu.id);
  refresh();
}
