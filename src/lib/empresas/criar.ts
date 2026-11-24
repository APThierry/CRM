import "server-only";
// Cria uma empresa nova com o primeiro administrador (Fase F).
// Usado pela página de cadastro (src/app/(publico)/cadastro) e pelo script scripts/criar-empresa.mts.
import { db } from "@/lib/db";
import { gerarHashSenha, validarSenhaNova } from "@/lib/senha";
import { prepararEmpresa, slugLivre } from "./preparar";

export type NovaEmpresa = {
  nome: string;
  admin: { nome: string; email: string; senha: string };
  /** Dias de teste. Sem valor = empresa já nasce ATIVA. */
  diasTeste?: number;
  documento?: string | null;
  telefone?: string | null;
  ramo?: string | null;
  /**
   * Cadastro público (F2): o administrador só entra depois de confirmar o e-mail,
   * a empresa só dispara campanhas depois que o dono aprova, e guardamos o aceite dos termos.
   */
  cadastroPublico?: { termosVersao: string };
};

export class ErroCadastro extends Error {}

export async function criarEmpresa(dados: NovaEmpresa, agora = new Date()) {
  const nome = dados.nome.trim();
  const email = dados.admin.email.trim().toLowerCase();
  const nomeAdmin = dados.admin.nome.trim();
  if (nome.length < 2) throw new ErroCadastro("Informe o nome da empresa.");
  if (!nomeAdmin) throw new ErroCadastro("Informe o nome do administrador.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErroCadastro("E-mail inválido.");
  const problema = validarSenhaNova(dados.admin.senha);
  if (problema) throw new ErroCadastro(problema);
  // Endereço único: cada e-mail pertence a uma empresa só.
  if (await db.usuario.findUnique({ where: { email }, select: { id: true } })) {
    throw new ErroCadastro("Este e-mail já tem conta no CRM.");
  }

  const senhaHash = await gerarHashSenha(dados.admin.senha);
  return db.$transaction(async (tx) => {
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
        termosAceitosEm: dados.cadastroPublico ? agora : null,
        termosVersao: dados.cadastroPublico?.termosVersao ?? null,
        testeAte: dados.diasTeste ? new Date(agora.getTime() + dados.diasTeste * 86_400_000) : null,
      },
    });
    await prepararEmpresa(tx, org);
    const admin = await tx.usuario.create({
      data: { organizacaoId: org.id, nome: nomeAdmin, email, senhaHash, papel: "ADMIN", emailConfirmadoEm: dados.cadastroPublico ? null : agora },
    });
    return { org, admin };
  });
}
