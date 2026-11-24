import "server-only";
// Rodízio entre as empresas: numa rodada do relógio, uma empresa com a fila cheia
// não segura as outras. Cada uma ganha um pedaço da rodada, e quem está há mais
// tempo sem ser atendida vai primeiro.

const guardado = globalThis as unknown as { rodizioCrm?: Map<string, number> };
const ultimaVez = (guardado.rodizioCrm ??= new Map<string, number>());
let vez = Date.now();

/**
 * Escolhe até `maximo` empresas desta rodada, começando por quem esperou mais, e
 * marca a vez delas. `fila` separa os rodízios (agendadas, webhooks).
 */
export function escolherEmpresas(fila: string, empresas: string[], maximo: number) {
  const chave = (id: string) => `${fila}:${id}`;
  const unicas = [...new Set(empresas)];
  const escolhidas = unicas.sort((a, b) => (ultimaVez.get(chave(a)) ?? 0) - (ultimaVez.get(chave(b)) ?? 0)).slice(0, maximo);
  vez++;
  for (const id of escolhidas) ultimaVez.set(chave(id), vez);
  // Empresas que sumiram não ficam no mapa para sempre.
  if (ultimaVez.size > 10_000) ultimaVez.clear();
  return escolhidas;
}

/** Quantos itens cada empresa pode ter na rodada. */
export const cotaPorEmpresa = (total: number, empresas: number, maximo = total) => Math.min(maximo, Math.max(1, Math.floor(total / Math.max(1, empresas))));

/** Roda `fn` para cada item, no máximo `simultaneos` por vez. Um erro não atrapalha os outros. */
export async function emParalelo<T, R>(itens: T[], simultaneos: number, fn: (item: T) => Promise<R>, aoFalhar: (e: unknown, item: T) => void) {
  const resultados: (R | undefined)[] = new Array(itens.length);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(simultaneos, itens.length) }, async () => {
      while (proximo < itens.length) {
        const i = proximo++;
        try {
          resultados[i] = await fn(itens[i]);
        } catch (e) {
          aoFalhar(e, itens[i]);
        }
      }
    }),
  );
  return resultados;
}
