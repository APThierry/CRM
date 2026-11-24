"use server";
// Gestão de usuários (só ADMIN) e perfil do próprio usuário.
//
// O administrador nunca define a senha de outra pessoa: ele convida (a pessoa escolhe a
// senha pelo link do e-mail) ou pede um link de senha nova, que vai para o e-mail dela.
import { refresh } from "next/cache";
import { after } from "next/server";
import type { Papel, Prisma } from "@/generated/prisma/client";
import { LIMITES } from "@/lib/ambiente";
import { exigirPapel, getUsuarioAtual } from "@/lib/auth";
import { aplicarSenha, avisoTetoUsuarios, criarConvite, enviarConvite, enviarNovaSenha, falhaDeEmail, invalidarCodigos, renovarConvite, vagasUsadas } from "@/lib/conta";
import { db } from "@/lib/db";
import { dentroDoLimite, esquecer, reservar } from "@/lib/limite";
import { conferirSenha, ErroOcupado, gerarHashSenha, validarSenhaNova } from "@/lib/senha";
import { encerrarSessoesDoUsuario, lerSessao, marcarAparelho } from "@/lib/sessao";
import { ESPERA_TRAVA, travar } from "@/lib/trava";
import { emailValido, normalizarEmail, umaLinha } from "@/lib/validar";

export type Resultado = { erro?: string; ok?: string } | null;

const PAPEIS: Papel[] = ["ADMIN", "GESTOR", "VENDEDOR", "INSTRUTOR"];
const papelDe = (v: FormDataEntryValue | null) => PAPEIS.find((p) => p === v) ?? "VENDEDOR";
const DIA_MS = 24 * 3600_000;

async function usuarioDaOrganizacao(usuarioId: string) {
  const admin = await exigirPapel("ADMIN");
  const usuario = await db.usuario.findFirst({ where: { id: usuarioId, organizacaoId: admin.organizacao.id } });
  if (!usuario) throw new Error("Usuário não encontrado.");
  return { admin, usuario };
}

/**
 * Impede ficar sem nenhum administrador que consiga entrar. Chame com a trava "usuarios"
 * da empresa: sem ela, dois administradores se rebaixando ao mesmo tempo passariam.
 */
async function restariaAdmin(tx: Prisma.TransactionClient, organizacaoId: string, usuarioId: string) {
  const outros = { organizacaoId, papel: "ADMIN", ativo: true, emailConfirmadoEm: { not: null }, senhaHash: { startsWith: "scrypt$" }, NOT: { id: usuarioId } } as const;
  return (await tx.usuario.count({ where: outros })) > 0;
}

// --------------------------------------------------------------- convites ---

/** Convites por dia de cada empresa e e-mails por dia para cada endereço: ninguém usa o convite para importunar. */
const podeConvidar = (organizacaoId: string) => dentroDoLimite(`convites:${organizacaoId}`, 40, DIA_MS);

function mandarConvite(r: Awaited<ReturnType<typeof renovarConvite>>, org: { id: string; nome: string }) {
  if (!r) return;
  // Muitos convites para o mesmo endereço (de qualquer empresa): não manda mais hoje, e a
  // resposta é a mesma. O envio é depois da resposta: o tempo não revela quem tem conta.
  if (!dentroDoLimite(`convite-email:${r.convite.email}`, 6, DIA_MS)) return;
  after(() => enviarConvite(r.convite, r.codigo, org).catch(falhaDeEmail("convite")));
}

const textoConvite = (email: string) => `Convite enviado para ${email}. A pessoa escolhe a própria senha pelo link, que vale por 3 dias.`;

export async function convidarUsuario(_e: Resultado, formData: FormData): Promise<Resultado> {
  const admin = await exigirPapel("ADMIN");
  const nome = umaLinha(formData.get("nome"), 80);
  const email = normalizarEmail(formData.get("email"));
  if (!nome || !email) return { erro: "Informe nome e e-mail." };
  if (!emailValido(email)) return { erro: "Confira o e-mail." };
  if (!podeConvidar(admin.organizacao.id)) return { erro: "Muitos convites hoje. Tente de novo amanhã." };

  const r = await criarConvite(admin.organizacao, { nome, email, papel: papelDe(formData.get("papel")) });
  if ("erro" in r) return { erro: r.erro };
  mandarConvite(r, admin.organizacao);
  refresh();
  return { ok: textoConvite(email) };
}

export async function reenviarConvite(conviteId: string, _e: Resultado): Promise<Resultado> {
  const admin = await exigirPapel("ADMIN");
  if (!dentroDoLimite(`convite-reenvio:${admin.organizacao.id}:${conviteId}`, 1, 5 * 60_000)) return { erro: "Espere 5 minutos para reenviar." };
  if (!podeConvidar(admin.organizacao.id)) return { erro: "Muitos convites hoje. Tente de novo amanhã." };
  const r = await renovarConvite(admin.organizacao.id, conviteId);
  if (!r) return { erro: "Convite não encontrado." };
  mandarConvite(r, admin.organizacao);
  refresh();
  return { ok: "Convite reenviado." };
}

export async function cancelarConvite(conviteId: string) {
  const admin = await exigirPapel("ADMIN");
  await db.convite.deleteMany({ where: { id: conviteId, organizacaoId: admin.organizacao.id } });
  refresh();
}

// --------------------------------------------------------------- usuários ---

export async function alterarPapel(usuarioId: string, formData: FormData) {
  const { admin } = await usuarioDaOrganizacao(usuarioId);
  const papel = papelDe(formData.get("papel"));
  await db.$transaction(async (tx) => {
    await travar(tx, "usuarios", admin.organizacao.id);
    if (papel !== "ADMIN" && !(await restariaAdmin(tx, admin.organizacao.id, usuarioId))) {
      throw new Error("É preciso ter pelo menos um administrador.");
    }
    await tx.usuario.update({ where: { id: usuarioId }, data: { papel } });
  }, ESPERA_TRAVA);
  refresh();
}

export async function alternarAtivo(usuarioId: string) {
  const { admin, usuario } = await usuarioDaOrganizacao(usuarioId);
  if (usuario.ativo) {
    if (usuario.id === admin.id) throw new Error("Você não pode desativar a si mesmo.");
    await db.$transaction(async (tx) => {
      await travar(tx, "usuarios", admin.organizacao.id);
      if (!(await restariaAdmin(tx, admin.organizacao.id, usuarioId))) {
        throw new Error("É preciso ter pelo menos um administrador.");
      }
      await tx.usuario.update({ where: { id: usuarioId }, data: { ativo: false } });
    }, ESPERA_TRAVA);
    await invalidarCodigos(usuarioId); // links de senha pendentes deixam de valer
    await encerrarSessoesDoUsuario(usuarioId); // sai de todos os aparelhos na hora
  } else {
    await db.$transaction(async (tx) => {
      await travar(tx, "usuarios", admin.organizacao.id);
      if ((await vagasUsadas(tx, admin.organizacao.id)) >= LIMITES.usuarios()) throw new Error(avisoTetoUsuarios());
      await tx.usuario.update({ where: { id: usuarioId }, data: { ativo: true } });
    }, ESPERA_TRAVA);
  }
  refresh();
}

/** Manda para o e-mail da pessoa um link para ela criar a própria senha. A senha atual continua valendo até lá. */
export async function mandarLinkDeSenha(usuarioId: string, _e: Resultado): Promise<Resultado> {
  const { admin, usuario } = await usuarioDaOrganizacao(usuarioId);
  if (!usuario.ativo) return { erro: "Reative o usuário antes." };
  const vaga = reservar([
    { chave: `senha-admin:${usuario.id}`, maximo: 1, janelaMs: 5 * 60_000 },
    { chave: `senha-admin-dia:${admin.organizacao.id}`, maximo: 40, janelaMs: DIA_MS },
  ]);
  if (!vaga.ok) return { erro: "Já mandamos um link há pouco. Espere alguns minutos." };
  after(() => enviarNovaSenha(usuario).catch(falhaDeEmail("usuarios")));
  return { ok: `Link enviado para ${usuario.email}.` };
}

// ---------------------------------------------------------------- perfil ---

export async function salvarPerfil(_e: Resultado, formData: FormData): Promise<Resultado> {
  const eu = await getUsuarioAtual();
  const nome = umaLinha(formData.get("nome"), 80);
  if (!nome) return { erro: "Informe seu nome." };
  await db.usuario.update({
    where: { id: eu.id },
    data: { nome, assinaturaWhatsapp: formData.get("assinaturaWhatsapp") === "on" },
  });
  refresh();
  return { ok: "Perfil salvo." };
}

export async function trocarMinhaSenha(_e: Resultado, formData: FormData): Promise<Resultado> {
  const eu = await getUsuarioAtual();
  const atual = String(formData.get("atual") ?? "");
  const nova = String(formData.get("nova") ?? "");
  if (nova !== String(formData.get("confirmacao") ?? "")) return { erro: "As senhas novas não conferem." };
  const problema = validarSenhaNova(nova);
  if (problema) return { erro: problema };

  // Quem pegou um aparelho aberto não fica tentando adivinhar a senha. Conta antes de conferir.
  const chave = `trocar-senha:${eu.id}`;
  const vaga = reservar([{ chave, maximo: 5, janelaMs: 15 * 60_000 }]);
  if (!vaga.ok) return { erro: `Muitas tentativas. Tente de novo em ${Math.ceil(vaga.esperaMs / 60_000)} min.` };

  const sessao = await lerSessao();
  try {
    const registro = await db.usuario.findUniqueOrThrow({ where: { id: eu.id } });
    if (!(await conferirSenha(atual, registro.senhaHash))) return { erro: "A senha atual está incorreta." };
    const senhaHash = await gerarHashSenha(nova);
    // Sai dos outros aparelhos (mantém este) e invalida links de senha pendentes.
    await marcarAparelho(await db.$transaction((tx) => aplicarSenha(tx, eu.id, senhaHash, new Date(), sessao?.id)));
  } catch (e) {
    if (!(e instanceof ErroOcupado)) throw e;
    vaga.devolver();
    return { erro: e.message };
  }
  esquecer(chave);
  return { ok: "Senha alterada. Os outros aparelhos foram desconectados." };
}
