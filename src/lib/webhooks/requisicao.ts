import "server-only";
// A conexão com o outro sistema (webhooks), feita com node:http/https em vez do
// fetch para controlar o IP em que o servidor realmente conecta:
//
// - o nome é consultado UMA vez, por nós, e a conexão usa exatamente os IPs que
//   acabamos de conferir (opção `lookup`). Trocar o DNS entre a conferência e a
//   conexão ("DNS rebinding") não adianta;
// - quando o endereço já é um IP, o Node não chama o `lookup`: conferimos à parte;
// - depois de conectar, antes de mandar qualquer byte, conferimos o IP de novo;
// - redirecionamento não é seguido e o corpo da resposta nunca é lido;
// - o tempo total (DNS + conexão + resposta) é limitado;
// - quem cadastra o webhook recebe só mensagens fixas, nunca o erro da conexão.
import { lookup as lookupDoSistema, Resolver } from "node:dns/promises";
import { Agent as AgentHttp, request as requestHttp, type ClientRequest } from "node:http";
import { Agent as AgentHttps, request as requestHttps } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import type { TLSSocket } from "node:tls";
import { destinoLocalPermitido, ERRO_DESTINO, ERRO_ENDERECO, hostDe, ipPublico, validarUrl } from "./destino";

export const TEMPO_LIMITE_MS = 10_000;
const TEMPO_DNS_MS = 3_000;

/** Devolve os IPs de um nome. Os testes trocam por um DNS de mentira. */
export type Consulta = (nome: string) => Promise<string[]>;

/**
 * Consulta padrão: pergunta direto ao servidor de DNS (c-ares). Não usa as threads
 * do Node (um DNS que não responde travaria o scrypt e os arquivos) nem o arquivo hosts.
 */
export const consultarDns: Consulta = async (nome) => {
  if (destinoLocalPermitido()) return (await lookupDoSistema(nome, { all: true })).map((e) => e.address);
  const dns = new Resolver({ timeout: TEMPO_DNS_MS, tries: 1 });
  const respostas = await Promise.allSettled([dns.resolve4(nome), dns.resolve6(nome)]);
  return respostas.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
};

class ErroDestino extends Error {}

/** `lookup` da conexão: só entrega IPs públicos. Um IP interno no meio recusa todos. */
export function lookupSeguro(consulta: Consulta): LookupFunction {
  return (nome, opcoes, pronto) => {
    consulta(nome).then(
      (ips) => {
        const validos = ips.filter((ip) => isIP(ip));
        if (validos.length === 0) return pronto(new Error("nome não encontrado"), "", 0);
        if (!destinoLocalPermitido() && !validos.every(ipPublico)) return pronto(new ErroDestino(ERRO_DESTINO), "", 0);
        const lista = validos.map((ip) => ({ address: ip, family: isIP(ip) }));
        if (opcoes.all) return pronto(null, lista);
        const escolhido = lista.find((e) => !opcoes.family || e.family === opcoes.family) ?? lista[0];
        pronto(null, escolhido.address, escolhido.family);
      },
      () => pronto(new Error("nome não encontrado"), "", 0),
    );
  };
}

/** Confere o endereço digitado e, se for um nome, para onde ele aponta agora. */
export async function conferirDestino(valor: string, consulta: Consulta = consultarDns): Promise<{ url?: string; erro?: string }> {
  const { url, erro } = validarUrl(valor);
  if (!url) return { erro };
  const host = hostDe(url);
  if (isIP(host) || destinoLocalPermitido()) return { url: url.toString() };
  const ips = await consulta(host).catch(() => [] as string[]);
  // Mesma mensagem para "não existe" e "aponta para dentro": não vira um mapa da rede interna.
  if (ips.length === 0 || !ips.every(ipPublico)) return { erro: ERRO_ENDERECO };
  return { url: url.toString() };
}

export type ResultadoPost = { codigo: number; erro?: undefined } | { codigo?: undefined; erro: string };

/** POST sem seguir redirecionamento e sem ler o corpo da resposta. Nunca lança erro. */
export function postar(
  endereco: string,
  { cabecalhos, corpo, consulta = consultarDns, tempoMs = TEMPO_LIMITE_MS }: { cabecalhos: Record<string, string>; corpo: string; consulta?: Consulta; tempoMs?: number },
): Promise<ResultadoPost> {
  const { url } = validarUrl(endereco);
  if (!url) return Promise.resolve({ erro: ERRO_DESTINO });
  const segura = url.protocol === "https:";
  const host = hostDe(url);

  return new Promise((resolver) => {
    let req: ClientRequest | undefined;
    let acabou = false;
    const fim = (r: ResultadoPost) => {
      if (acabou) return;
      acabou = true;
      clearTimeout(relogio);
      resolver(r);
      req?.destroy(); // fecha a conexão sem ler o corpo
    };
    const relogio = setTimeout(() => fim({ erro: `não respondeu em ${Math.round(tempoMs / 1000)} segundos` }), tempoMs);

    try {
      const opcoes = {
        method: "POST",
        hostname: host,
        port: url.port || (segura ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers: { ...cabecalhos, Host: url.host, "Content-Length": String(Buffer.byteLength(corpo)), Connection: "close" },
        lookup: lookupSeguro(consulta),
        maxHeaderSize: 8 * 1024,
        setHost: false,
      };
      // Agente próprio: sem reaproveitar conexão e sem proxy do ambiente.
      req = segura
        ? requestHttps({ ...opcoes, agent: new AgentHttps({ keepAlive: false }), servername: isIP(host) ? undefined : host, rejectUnauthorized: true })
        : requestHttp({ ...opcoes, agent: new AgentHttp({ keepAlive: false }) });

      req.on("socket", (socket) => {
        // Última conferência: o IP em que conectou de verdade. `prepend` = antes de mandar os dados.
        socket.prependOnceListener("connect", () => {
          const ip = socket.remoteAddress ?? "";
          if (!destinoLocalPermitido() && !ipPublico(ip)) fim({ erro: ERRO_DESTINO });
        });
      });
      req.on("response", (res) => fim({ codigo: res.statusCode ?? 0 }));
      req.on("upgrade", (res) => fim({ codigo: res.statusCode ?? 0 }));
      req.on("close", () => fim({ erro: "não consegui conectar" }));
      req.on("error", (e: NodeJS.ErrnoException) => {
        if (e instanceof ErroDestino) return fim({ erro: ERRO_DESTINO });
        const tls = (req?.socket as TLSSocket | undefined)?.authorizationError || /CERT|TLS|SSL|SELF_SIGNED/.test(e.code ?? "");
        fim({ erro: tls ? "o certificado HTTPS do outro sistema não é válido" : "não consegui conectar" });
      });
      req.end(corpo);
    } catch {
      fim({ erro: "não consegui conectar" });
    }
  });
}
