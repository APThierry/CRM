import "server-only";
// Links enviados por e-mail (Fase F2): confirmar o cadastro e criar uma nova senha.
// O link leva um código aleatório; no banco fica só o SHA-256 dele, como nas sessões.
// Cada código vale uma vez só e expira. Pedir outro invalida o anterior.
import { createHash, randomBytes } from "node:crypto";
import type { TipoCodigoEmail } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { emailComBotao, enviarEmail } from "@/lib/email";
import { nomeDoApp, urlBase } from "@/lib/url";

const hash = (codigo: string) => createHash("sha256").update(codigo).digest("hex");

export const VALIDADE = { CONFIRMAR_EMAIL: 48 * 3600_000, NOVA_SENHA: 3600_000 } as const;

export async function criarCodigo(usuarioId: string, tipo: TipoCodigoEmail, agora = new Date()) {
  const codigo = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.codigoEmail.updateMany({ where: { usuarioId, tipo, usadoEm: null }, data: { usadoEm: agora } }),
    db.codigoEmail.create({ data: { usuarioId, tipo, tokenHash: hash(codigo), expiraEm: new Date(agora.getTime() + VALIDADE[tipo]) } }),
  ]);
  return codigo;
}

const formatoValido = (codigo: string) => /^[\w-]{20,64}$/.test(codigo);

/** O código ainda vale? (Só olha, não gasta. Usado para mostrar a página certa.) */
export async function conferirCodigo(codigo: string, tipo: TipoCodigoEmail, agora = new Date()) {
  if (!formatoValido(codigo)) return null;
  const c = await db.codigoEmail.findUnique({ where: { tokenHash: hash(codigo) }, include: { usuario: { include: { organizacao: true } } } });
  if (!c || c.tipo !== tipo || c.usadoEm || c.expiraEm <= agora || !c.usuario.ativo) return null;
  return c.usuario;
}

/** Gasta o código (uma vez só, mesmo com dois cliques ao mesmo tempo) e devolve o usuário. */
export async function usarCodigo(codigo: string, tipo: TipoCodigoEmail, agora = new Date()) {
  const usuario = await conferirCodigo(codigo, tipo, agora);
  if (!usuario) return null;
  const gastou = await db.codigoEmail.updateMany({ where: { tokenHash: hash(codigo), usadoEm: null }, data: { usadoEm: agora } });
  return gastou.count ? usuario : null;
}

type Pessoa = { id: string; nome: string; email: string };

export async function enviarConfirmacao(usuario: Pessoa, empresa: string) {
  const codigo = await criarCodigo(usuario.id, "CONFIRMAR_EMAIL");
  const link = `${await urlBase()}/confirmar?codigo=${codigo}`;
  await enviarEmail(
    emailComBotao({
      para: usuario.email,
      assunto: `Confirme seu e-mail para entrar no ${nomeDoApp()}`,
      saudacao: `Olá, ${usuario.nome.split(" ")[0]}!`,
      paragrafos: [`A conta da ${empresa} foi criada. Falta só confirmar que este e-mail é seu.`, "O link vale por 48 horas."],
      botao: "Confirmar e entrar",
      link,
      rodape: "Se você não se cadastrou, ignore este e-mail: sem a confirmação, ninguém entra na conta.",
    }),
  );
}

export async function enviarNovaSenha(usuario: Pessoa) {
  const codigo = await criarCodigo(usuario.id, "NOVA_SENHA");
  const link = `${await urlBase()}/senha/nova?codigo=${codigo}`;
  await enviarEmail(
    emailComBotao({
      para: usuario.email,
      assunto: `Criar uma nova senha no ${nomeDoApp()}`,
      saudacao: `Olá, ${usuario.nome.split(" ")[0]}!`,
      paragrafos: ["Recebemos um pedido para criar uma nova senha para a sua conta.", "O link vale por 1 hora e funciona uma vez só."],
      botao: "Criar nova senha",
      link,
      rodape: "Se não foi você, ignore este e-mail: a sua senha continua a mesma.",
    }),
  );
}

/** Avisa o dono do sistema (DONO_EMAIL no .env) que uma empresa se cadastrou. */
export async function avisarDonoDoCadastro(org: { nome: string; ramo: string | null; testeAte: Date | null }, admin: Pessoa, telefone: string | null) {
  const dono = process.env.DONO_EMAIL?.trim();
  if (!dono) return;
  const fim = org.testeAte ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(org.testeAte) : "sem prazo";
  await enviarEmail({
    para: dono,
    assunto: `Nova empresa no ${nomeDoApp()}: ${org.nome}`,
    texto: [
      `Empresa: ${org.nome}`,
      `Ramo: ${org.ramo ?? "não informado"}`,
      `Quem cadastrou: ${admin.nome} <${admin.email}>`,
      `Telefone: ${telefone ?? "não informado"}`,
      `Teste até: ${fim}`,
      "",
      "As campanhas dela ficam bloqueadas até você liberar (por enquanto, no Prisma Studio: Organizacao.campanhasLiberadas).",
    ].join("\n"),
  });
}
