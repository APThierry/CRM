// Para onde um webhook pode apontar? Só para sites públicos na internet.
//
// Sem isto, quem cadastra um webhook poderia mandar o servidor do CRM falar com
// endereços internos da VPS (banco, Evolution API, painel da hospedagem...) e ler
// a resposta: é a falha conhecida como SSRF.
//
// Contas puras, sem banco e sem rede. Quem conecta é ./requisicao.ts, que confere
// o IP de novo na hora (o mesmo nome pode passar a apontar para outro lugar).
import { isIP } from "node:net";
import { emProducao } from "../ambiente";

/**
 * WEBHOOKS_PERMITIR_LOCAL=1: aceita destino local, só para desenvolver e testar
 * (ex.: n8n no próprio computador). Nunca vale em produção.
 */
export const destinoLocalPermitido = () => process.env.WEBHOOKS_PERMITIR_LOCAL === "1" && !emProducao();

export const ERRO_DESTINO = "endereço não permitido";

// --- IPs -------------------------------------------------------------------------

/** Faixas de IPv4 que não são da internet pública: [rede, bits]. */
const IPV4_BLOQUEADOS: [string, number][] = [
  ["0.0.0.0", 8], // "esta rede" (0.0.0.0 cai no próprio servidor)
  ["10.0.0.0", 8], // privada
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // o próprio servidor
  ["169.254.0.0", 16], // link-local (inclui o 169.254.169.254 das nuvens)
  ["172.16.0.0", 12], // privada (e as redes do Docker)
  ["192.0.0.0", 24], // reservada (IETF)
  ["192.0.2.0", 24], // documentação
  ["192.88.99.0", 24], // 6to4 (antigo)
  ["192.168.0.0", 16], // privada
  ["198.18.0.0", 15], // testes de rede
  ["198.51.100.0", 24], // documentação
  ["203.0.113.0", 24], // documentação
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservada (e 255.255.255.255)
];

const numeroIpv4 = (ip: string) => ip.split(".").reduce((n, parte) => n * 256 + Number(parte), 0);

function ipv4Publico(ip: string) {
  const n = numeroIpv4(ip);
  return !IPV4_BLOQUEADOS.some(([rede, bits]) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(numeroIpv4(rede) / 2 ** (32 - bits)));
}

/** "2001:db8::1" -> 8 números de 16 bits. Aceita o final em IPv4 (::ffff:1.2.3.4). */
function gruposIpv6(ip: string): number[] {
  let texto = ip.toLowerCase();
  const final = texto.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (final) {
    const n = numeroIpv4(final);
    texto = texto.slice(0, -final.length) + `${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const [antes, depois] = texto.split("::");
  const ler = (t: string | undefined) => (t ? t.split(":").map((g) => parseInt(g, 16)) : []);
  const inicio = ler(antes);
  if (depois === undefined) return inicio;
  const fim = ler(depois);
  return [...inicio, ...Array<number>(8 - inicio.length - fim.length).fill(0), ...fim];
}

/**
 * IPv6: só o endereçamento público (2000::/3), menos as faixas especiais dele.
 * Fica de fora tudo que carrega um IPv4 dentro (::ffff:127.0.0.1, 64:ff9b::, 2002::,
 * Teredo, ISATAP): seria um jeito de chegar num IPv4 interno.
 */
function ipv6Publico(ip: string) {
  const g = gruposIpv6(ip);
  if (g.length !== 8 || g.some((x) => Number.isNaN(x))) return false;
  if (g[0] >> 13 !== 1) return false; // fora de 2000::/3: ::1, fc00::/7 (ULA), fe80::/10, ff00::/8, ::ffff:0:0/96, 64:ff9b::...
  if (g[0] === 0x2001 && g[1] < 0x200) return false; // 2001::/23 (Teredo e outras especiais)
  if (g[0] === 0x2001 && g[1] === 0xdb8) return false; // documentação
  if (g[0] === 0x2002) return false; // 6to4
  if (g[0] === 0x3fff && g[1] < 0x1000) return false; // documentação
  if ((g[4] & 0xfdff) === 0 && g[5] === 0x5efe) return false; // ISATAP
  return true;
}

/** O IP é da internet pública? Qualquer coisa que não seja um IP de verdade = não. */
export function ipPublico(ip: string) {
  const tipo = isIP(ip); // com zona (fe80::1%eth0) o Node aceita; nós não
  if (tipo === 0 || ip.includes("%")) return false;
  return tipo === 4 ? ipv4Publico(ip) : ipv6Publico(ip);
}

// --- Nomes e endereços completos ----------------------------------------------------

/** Finais de nome que só existem em redes internas. */
const FINAIS_INTERNOS = [
  "local", "localhost", "localdomain", "internal", "intranet", "lan", "home", "corp", "private", "arpa", "onion", "invalid",
];

/** Nome de site da internet: com ponto e sem final de rede interna. */
export function nomePublico(nome: string) {
  const partes = nome.toLowerCase().replace(/\.+$/, "").split(".");
  return partes.length >= 2 && partes.every((p) => p !== "") && !FINAIS_INTERNOS.includes(partes.at(-1)!);
}

/** Nome ou IP do endereço, sem os colchetes do IPv6 e sem o ponto final. */
export const hostDe = (url: URL) => url.hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "");

const PORTAS_PRODUCAO = ["", "443", "8443"];
const TAMANHO_MAXIMO = 500;

export type ResultadoUrl = { url: URL; erro?: undefined } | { url?: undefined; erro: string };

/** Confere o endereço digitado (sem rede). Usado ao criar, ao editar e de novo a cada entrega. */
export function validarUrl(valor: string): ResultadoUrl {
  if (valor.length > TAMANHO_MAXIMO) return { erro: `Endereço grande demais (máximo ${TAMANHO_MAXIMO} caracteres).` };
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return { erro: "Endereço inválido. Use um endereço completo, começando com https://" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { erro: "Endereço inválido. Use um endereço completo, começando com https://" };
  if (url.username || url.password) return { erro: "Não coloque usuário e senha no endereço: eles vazariam nos registros." };
  url.hash = "";
  if (emProducao()) {
    if (url.protocol !== "https:") return { erro: "Use um endereço https:// (sem HTTPS os dados viajam sem criptografia)." };
    if (!PORTAS_PRODUCAO.includes(url.port)) return { erro: "Use a porta padrão do HTTPS (443) ou a 8443." };
  }
  if (destinoLocalPermitido()) return { url };
  const host = hostDe(url);
  const publico = isIP(host) ? ipPublico(host) : nomePublico(host);
  return publico ? { url } : { erro: ERRO_ENDERECO };
}

export const ERRO_ENDERECO = "Este endereço não pode ser usado: precisa ser um site público na internet.";
