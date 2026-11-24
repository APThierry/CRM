import "server-only";
// Limite simples de tentativas (ex.: no máximo 3 cadastros por hora do mesmo IP).
// Fica na memória do servidor e reinicia junto com ele, como o bloqueio do login.
// Na VPS roda UM processo do CRM, então basta.
import { headers } from "next/headers";

const contagens = new Map<string, number[]>();

/** Registra uma tentativa. Retorna false se passou do limite na janela. */
export function dentroDoLimite(chave: string, maximo: number, janelaMs: number, agora = Date.now()) {
  const recentes = (contagens.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (recentes.length >= maximo) {
    contagens.set(chave, recentes);
    return false;
  }
  recentes.push(agora);
  contagens.set(chave, recentes);
  // Limpeza de vez em quando, para o mapa não crescer para sempre.
  if (contagens.size > 5000) for (const [k, v] of contagens) if (v.every((t) => agora - t >= janelaMs)) contagens.delete(k);
  return true;
}

/** IP de quem fez a requisição (na VPS o Caddy manda o X-Forwarded-For). */
export async function ipDaRequisicao() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}
