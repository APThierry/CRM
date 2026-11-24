"use server";
// Link da agenda (.ics) do usuário logado.
import { refresh } from "next/cache";
import { desligarAgenda, gerarCodigoAgenda } from "@/lib/agenda";
import { getUsuarioAtual } from "@/lib/auth";
import { ErroConfiguracao, urlBase } from "@/lib/url";

export type ResultadoAgenda = { link?: string; erro?: string } | null;

/** Gera um link novo (o anterior para de funcionar) e mostra uma vez. */
export async function gerarLinkAgenda(_estado: ResultadoAgenda): Promise<ResultadoAgenda> {
  const eu = await getUsuarioAtual();
  let base: string;
  try {
    base = await urlBase(); // antes de gerar: sem endereço, o link antigo continua valendo
  } catch (e) {
    if (!(e instanceof ErroConfiguracao)) throw e;
    console.error(`[agenda] ${e.message}`);
    return { erro: "O servidor ainda não está configurado para gerar links. Fale com o suporte." };
  }
  const codigo = await gerarCodigoAgenda(eu.id);
  refresh();
  return { link: `${base}/api/agenda/${codigo}.ics` };
}

export async function desligarLinkAgenda() {
  const eu = await getUsuarioAtual();
  await desligarAgenda(eu.id);
  refresh();
}
