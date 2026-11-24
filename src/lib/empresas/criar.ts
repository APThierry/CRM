import "server-only";
// Cria uma empresa nova com o primeiro administrador (Fase F).
// Usado pelo cadastro público (src/lib/conta.ts, depois que a pessoa confirma o e-mail)
// e pelo script scripts/criar-empresa.mts.
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { gerarHashSenha, SEM_SENHA, validarSenhaNova } from "@/lib/senha";
import { ESPERA_TRAVA, travar } from "@/lib/trava";
import { emailValido, normalizarEmail, umaLinha } from "@/lib/validar";
import { gerarSlug, prepararEmpresa, slugLivre } from "./preparar";

export type NovaEmpresa = {
  nome: string;
  /** Sem `senha`, o administrador define a própria pelo link (nasce sem confirmação). */
  admin: { nome: string; email: string; senha?: string };
  /** Dias de teste. Sem valor = empresa já nasce ATIVA. */
  diasTeste?: number;
  documento?: string | null;
  telefone?: string | null;
  ramo?: string | null;
  /**
   * Cadastro público (F2): a empresa só dispara campanhas depois que o dono aprova,
   * tem teto diário de mensagens novas, e guardamos o aceite dos termos.
   */
  cadastroPublico?: { termosVersao: string; aceitosEm?: Date };
};

export class ErroCadastro extends Error {}

/** Confere os dados e faz o hash da senha (fora da transação, porque demora). */
async function preparar(dados: NovaEmpresa) {
  const nome = umaLinha(dados.nome, 120);
  const email = normalizarEmail(dados.admin.email);
  const nomeAdmin = umaLinha(dados.admin.nome, 120);
  if (nome.length < 2) throw new ErroCadastro("Informe o nome da empresa.");
  if (!nomeAdmin) throw new ErroCadastro("Informe o nome do administrador.");
  if (!emailValido(email)) throw new ErroCadastro("E-mail inválido.");
  const problema = dados.admin.senha === undefined ? null : validarSenhaNova(dados.admin.senha);
  if (problema) throw new ErroCadastro(problema);
  return { nome, email, nomeAdmin, senhaHash: dados.admin.senha === undefined ? SEM_SENHA : await gerarHashSenha(dados.admin.senha) };
}

/**
 * Cria a empresa. `antes` roda dentro da mesma transação, antes de criar (ex.: gastar
 * o link do cadastro): se der erro ali ou aqui, nada é gravado.
 */
export async function criarEmpresa(dados: NovaEmpresa, agora = new Date(), antes?: (tx: Prisma.TransactionClient) => Promise<void>) {
  const { nome, email, nomeAdmin, senhaHash } = await preparar(dados);
  const comSenha = dados.admin.senha !== undefined;
  return db.$transaction(async (tx) => {
    // Uma de cada vez por e-mail e por nome: dois cadastros ao mesmo tempo não colidem.
    await travar(tx, "email", email);
    await travar(tx, "slug", gerarSlug(nome));
    await antes?.(tx);
    // Endereço único: cada e-mail pertence a uma empresa só.
    if (await tx.usuario.findUnique({ where: { email }, select: { id: true } })) {
      throw new ErroCadastro("Este e-mail já tem conta no CRM.");
    }
    const org = await tx.organizacao.create({
      data: {
        nome,
        slug: await slugLivre(tx, nome),
        documento: dados.documento || null,
        telefone: dados.telefone || null,
        email,
        ramo: dados.ramo || null,
        situacao: dados.diasTeste ? "EM_TESTE" : "ATIVA",
        campanhasLiberadas: !dados.cadastroPublico,
        termosAceitosEm: dados.cadastroPublico ? (dados.cadastroPublico.aceitosEm ?? agora) : null,
        termosVersao: dados.cadastroPublico?.termosVersao ?? null,
        testeAte: dados.diasTeste ? new Date(agora.getTime() + dados.diasTeste * 86_400_000) : null,
      },
    });
    await prepararEmpresa(tx, org);
    const admin = await tx.usuario.create({
      // Só entra quem definiu a própria senha (pelo link do e-mail ou do script).
      data: { organizacaoId: org.id, nome: nomeAdmin, email, senhaHash, papel: "ADMIN", emailConfirmadoEm: comSenha ? agora : null },
    });
    return { org, admin };
  }, ESPERA_TRAVA);
}
