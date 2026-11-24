import "server-only";
// Proteção do login contra quem tenta adivinhar senhas.
//
// Cada tentativa é RESERVADA antes de consultar o banco ou conferir a senha
// (src/lib/limite.ts), então uma rajada de pedidos ao mesmo tempo não passa inteira.
// Em 15 minutos, contando só as senhas erradas:
// - 5 por IP + e-mail (o caso comum: a mesma pessoa errando);
// - 30 por IP (alguém tentando vários e-mails);
// - 20 por e-mail, somando todos os IPs (ataque vindo de muitos lugares).
//
// O limite por e-mail poderia ser usado para trancar o dono do lado de fora. Por isso:
// - quem já entrou naquele aparelho tem um cookie (assinado com a própria senha) e
//   uma conta de tentativas só dele, que ninguém mais consegue gastar;
// - pedido recusado não conta: quando o ataque para, o bloqueio acaba em até 15 min;
// - "Esqueci minha senha" continua funcionando e já entra.
// A troca: durante um ataque, quem está num aparelho NOVO precisa esperar a vez ou
// usar o link do e-mail.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { esquecer, reservar, type Regra } from "@/lib/limite";
import { temSenha } from "@/lib/senha";

const JANELA = 15 * 60_000;
export const REGRAS_LOGIN = { porIpEmail: 5, porIp: 30, porEmail: 20, porAparelho: 10 } as const;

const chavePar = (ip: string, email: string) => `login:par:${ip}:${email}`;

/** Sem IP conhecido não há limite por IP (todos dividiriam o mesmo): fica o limite por e-mail. */
export function reservarLogin(ip: string | null, email: string, agora?: number) {
  const regras: Regra[] = [{ chave: `login:conta:${email}`, maximo: REGRAS_LOGIN.porEmail, janelaMs: JANELA }];
  if (ip) {
    regras.push({ chave: `login:ip:${ip}`, maximo: REGRAS_LOGIN.porIp, janelaMs: JANELA });
    regras.push({ chave: chavePar(ip, email), maximo: REGRAS_LOGIN.porIpEmail, janelaMs: JANELA });
  }
  return reservar(regras, agora);
}

/** Acertou a senha: os erros daquele IP com aquele e-mail são esquecidos. */
export function loginCerto(ip: string | null, email: string) {
  if (ip) esquecer(chavePar(ip, email));
}

// --- Aparelho conhecido ----------------------------------------------------------

export const COOKIE_APARELHO = "crm_aparelho";
export const DIAS_APARELHO = 180;

type Conta = { id: string; senhaHash: string };
/** A chave é o hash da senha: trocar a senha invalida os cookies antigos sozinho. */
const assinar = (conta: Conta, nonce: string) => createHmac("sha256", conta.senhaHash).update(`aparelho:${conta.id}:${nonce}`).digest();

/** Cookie para o aparelho em que a pessoa acabou de entrar. */
export function novoAparelho(conta: Conta) {
  const nonce = randomBytes(12).toString("base64url");
  return `${nonce}.${assinar(conta, nonce).toString("base64url")}`;
}

/** Confere o cookie. Devolve o código do aparelho, ou null. */
export function aparelhoDaConta(conta: Conta | null, cookie: string | undefined) {
  const [nonce, assinatura] = (cookie ?? "").split(".");
  if (!conta || !temSenha(conta.senhaHash) || !nonce || !assinatura || nonce.length > 40) return null;
  const recebida = Buffer.from(assinatura, "base64url");
  const esperada = assinar(conta, nonce);
  return recebida.length === esperada.length && timingSafeEqual(recebida, esperada) ? nonce : null;
}

/** Conta de tentativas só daquele aparelho (usada quando os limites gerais estão cheios). */
export const reservarAparelho = (aparelho: string, agora?: number) =>
  reservar([{ chave: `login:aparelho:${aparelho}`, maximo: REGRAS_LOGIN.porAparelho, janelaMs: JANELA }], agora);

export const avisoDeEspera = (esperaMs: number) =>
  `Muitas tentativas. Tente de novo em ${Math.max(1, Math.ceil(esperaMs / 60_000))} min ou use "Esqueci minha senha".`;
