import "server-only";
// Limites de tentativas (ex.: no máximo 5 cadastros por hora do mesmo IP).
// Ficam na memória do servidor e reiniciam junto com ele. Na VPS roda UM
// processo do CRM, então basta.
//
// - `reservar` confere e conta no mesmo instante (sem await no meio): cem
//   pedidos ao mesmo tempo não passam todos pela conferência.
// - Pedido recusado não conta: insistir não aumenta o bloqueio.
// - O mapa tem limpeza e teto de tamanho.
import { isIP } from "node:net";
import { headers } from "next/headers";

/** Teto de chaves guardadas. Passou disso, as vencidas saem e, se preciso, as mais antigas. */
export const MAX_CHAVES = 100_000;

type Registro = { vezes: number[]; ate: number };
// No globalThis: o build pode carregar este arquivo mais de uma vez no mesmo processo.
const guardado = globalThis as unknown as { limitesCrm?: Map<string, Registro> };
const registros = (guardado.limitesCrm ??= new Map<string, Registro>());

function limpar(agora: number) {
  for (const [chave, r] of registros) if (r.ate <= agora) registros.delete(chave);
  // Ainda cheio (muitas chaves diferentes ao mesmo tempo): tira as mais antigas.
  for (const chave of registros.keys()) {
    if (registros.size <= MAX_CHAVES * 0.9) break;
    registros.delete(chave);
  }
}

export type Regra = { chave: string; maximo: number; janelaMs: number };
export type Reserva = { ok: true; devolver: () => void } | { ok: false; esperaMs: number };

const recentes = (regra: Regra, agora: number) => (registros.get(regra.chave)?.vezes ?? []).filter((t) => agora - t < regra.janelaMs);

/**
 * Reserva uma tentativa em todas as regras, ou em nenhuma. Se alguma está cheia,
 * devolve quanto falta para abrir vaga. `devolver` desfaz a reserva (ex.: a senha
 * estava certa, então não conta como erro).
 */
export function reservar(regras: Regra[], agora = Date.now()): Reserva {
  let esperaMs = 0;
  const listas = regras.map((r) => recentes(r, agora));
  regras.forEach((r, i) => {
    if (listas[i].length < r.maximo) return;
    const abreEm = r.maximo > 0 ? listas[i][listas[i].length - r.maximo] + r.janelaMs - agora : r.janelaMs;
    esperaMs = Math.max(esperaMs, abreEm, 1);
  });
  if (esperaMs > 0) return { ok: false, esperaMs };

  if (registros.size >= MAX_CHAVES) limpar(agora);
  regras.forEach((r, i) => {
    listas[i].push(agora);
    registros.delete(r.chave); // volta para o fim da fila (as mais antigas saem primeiro)
    registros.set(r.chave, { vezes: listas[i], ate: agora + r.janelaMs });
  });
  let devolvida = false;
  return {
    ok: true,
    devolver: () => {
      if (devolvida) return;
      devolvida = true;
      for (const r of regras) {
        const reg = registros.get(r.chave);
        if (!reg) continue;
        const i = reg.vezes.lastIndexOf(agora);
        if (i >= 0) reg.vezes.splice(i, 1);
        if (reg.vezes.length === 0) registros.delete(r.chave);
      }
    },
  };
}

/** Registra uma tentativa. Retorna false se passou do limite na janela. */
export function dentroDoLimite(chave: string, maximo: number, janelaMs: number, agora = Date.now()) {
  return reservar([{ chave, maximo, janelaMs }], agora).ok;
}

/** Esquece uma chave (ex.: acertou a senha). */
export const esquecer = (chave: string) => void registros.delete(chave);

/** Quantas chaves estão guardadas (para os testes). */
export const totalDeChaves = () => registros.size;

/** Só o IP (sem porta) e, no IPv6, só a rede /64: trocar o final do endereço não zera o limite. */
export function normalizarIp(valor: string | null | undefined) {
  let ip = (valor ?? "").trim().toLowerCase();
  if (ip.startsWith("[")) ip = ip.slice(1).split("]")[0];
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.split(":")[0];
  if (ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  const tipo = isIP(ip);
  if (tipo === 4) return ip;
  if (tipo !== 6) return null;
  // O construtor de URL escreve o IPv6 sempre do mesmo jeito (sem zeros à esquerda).
  const limpo = new URL(`http://[${ip.split("%")[0]}]`).hostname.slice(1, -1);
  const [antes, depois] = limpo.split("::");
  const grupos = antes ? antes.split(":") : [];
  if (depois !== undefined) {
    const fim = depois ? depois.split(":") : [];
    while (grupos.length + fim.length < 8) grupos.push("0");
    grupos.push(...fim);
  }
  return `${grupos.slice(0, 4).join(":")}::/64`;
}

/**
 * IP de quem fez a requisição, ou null se não dá para saber.
 *
 * Só confiamos no cabeçalho escrito em PROXY_IP_HEADER (ex.: x-real-ip), que o
 * Caddy SEMPRE sobrescreve (docs/DEPLOY-VPS.md). O X-Forwarded-For comum pode ser
 * inventado por quem faz a requisição. Se o cabeçalho for uma lista, vale o último
 * item, que é o que o nosso proxy acrescentou.
 */
export async function ipDaRequisicao() {
  const nome = process.env.PROXY_IP_HEADER?.trim().toLowerCase();
  if (!nome || !/^[a-z0-9-]{1,40}$/.test(nome)) return null;
  const valor = (await headers()).get(nome);
  return normalizarIp(valor?.split(",").at(-1));
}

/**
 * Regra por IP, para `reservar`. Sem saber o IP, todo mundo dividiria a mesma conta e um
 * só derrubaria os outros: aí não há limite por IP, ou vale `geralSemIp` (um limite maior
 * para o site todo), só onde o abuso custa caro, como mandar e-mail para qualquer endereço.
 */
export function regraPorIp(nome: string, ip: string | null, maximo: number, janelaMs: number, geralSemIp?: number): Regra[] {
  if (ip) return [{ chave: `${nome}:ip:${ip}`, maximo, janelaMs }];
  return geralSemIp === undefined ? [] : [{ chave: `${nome}:sem-ip`, maximo: geralSemIp, janelaMs }];
}
