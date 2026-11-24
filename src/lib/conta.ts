import "server-only";
// Contas e links enviados por e-mail (Fase F2 e segurança):
// - criar conta: o pedido fica em CadastroPendente; a empresa e o administrador só
//   nascem quando a pessoa abre o link e define a própria senha;
// - convite: o administrador convida; o usuário só nasce quando a pessoa aceita;
// - nova senha ("esqueci minha senha", ou pedida pelo administrador).
//
// O link leva um código aleatório; no banco fica só o SHA-256 dele, como nas sessões.
// Abrir o link não gasta nada (programas de e-mail abrem links sozinhos): o código é
// gasto no envio do formulário, uma vez só, junto com a troca da senha.
//
// Nada aqui conta para quem pediu se um e-mail já tem conta: quem recebe o aviso é o
// dono do e-mail.
import { createHash, randomBytes } from "node:crypto";
import type { Papel, Prisma } from "@/generated/prisma/client";
import { emProducao, LIMITES } from "@/lib/ambiente";
import { diasDeTeste, TERMOS_VERSAO } from "@/lib/cadastro";
import { db } from "@/lib/db";
import { emailComBotao, enviarEmail } from "@/lib/email";
import { criarEmpresa, ErroCadastro } from "@/lib/empresas/criar";
import { gerarHashSenha } from "@/lib/senha";
import { ESPERA_TRAVA, travar } from "@/lib/trava";
import { nomeDoApp, urlBase } from "@/lib/url";
import { nomeParaEmail } from "@/lib/validar";

const HORA = 3600_000;
export const VALIDADE = { CADASTRO: 48 * HORA, CONVITE: 72 * HORA, NOVA_SENHA: HORA } as const;

const hash = (codigo: string) => createHash("sha256").update(codigo).digest("hex");
const novoCodigo = () => randomBytes(32).toString("base64url");
const formatoValido = (codigo: string) => /^[\w-]{20,64}$/.test(codigo);
const daqui = (agora: Date, ms: number) => new Date(agora.getTime() + ms);

type Pessoa = { id: string; nome: string; email: string };

/** No terminal fica só o tipo do erro: nada de e-mail, link ou endereço do servidor. */
export const falhaDeEmail = (onde: string) => (e: unknown) => {
  const codigo = (e as { code?: unknown } | null)?.code;
  console.error(`[${onde}] não consegui enviar o e-mail${typeof codigo === "string" ? ` (${codigo})` : ""}.`, emProducao() ? (e instanceof Error ? e.name : "") : e);
};

// ---------------------------------------------------------------------------
// Nova senha
// ---------------------------------------------------------------------------

/**
 * Cria o código. Os anteriores continuam valendo até vencer: todos foram para o mesmo
 * e-mail, e assim quem fica pedindo links em nome de outra pessoa não estraga o link
 * que ela está usando. Trocar a senha invalida todos de uma vez (aplicarSenha).
 */
export async function criarCodigoSenha(usuarioId: string, agora = new Date(), validadeMs: number = VALIDADE.NOVA_SENHA) {
  const codigo = novoCodigo();
  await db.codigoEmail.create({ data: { usuarioId, tipo: "NOVA_SENHA", tokenHash: hash(codigo), expiraEm: daqui(agora, validadeMs), criadoEm: agora } });
  return codigo;
}

/** O código ainda vale? (Só olha, não gasta. Usado para mostrar a página certa.) */
export async function conferirCodigoSenha(codigo: string, agora = new Date()) {
  if (!formatoValido(codigo)) return null;
  const c = await db.codigoEmail.findUnique({ where: { tokenHash: hash(codigo) }, include: { usuario: { include: { organizacao: true } } } });
  if (!c || c.tipo !== "NOVA_SENHA" || c.usadoEm || c.expiraEm <= agora || !c.usuario.ativo) return null;
  return c.usuario;
}

/**
 * Grava a senha nova, invalida todos os links pendentes e desconecta os aparelhos
 * (menos a sessão informada, quando a própria pessoa troca no perfil).
 */
export async function aplicarSenha(tx: Prisma.TransactionClient, usuarioId: string, senhaHash: string, agora = new Date(), manterSessao?: string) {
  await tx.codigoEmail.updateMany({ where: { usuarioId, usadoEm: null }, data: { usadoEm: agora } });
  await tx.sessao.deleteMany({ where: { usuarioId, ...(manterSessao ? { NOT: { id: manterSessao } } : {}) } });
  return tx.usuario.update({ where: { id: usuarioId }, data: { senhaHash }, include: { organizacao: true } });
}

/** Links pendentes deixam de valer (ex.: usuário desativado). */
export const invalidarCodigos = (usuarioId: string, agora = new Date()) =>
  db.codigoEmail.updateMany({ where: { usuarioId, usadoEm: null }, data: { usadoEm: agora } });

/** Gasta o link (uma vez só, mesmo com dois cliques ao mesmo tempo) e troca a senha. */
export async function trocarSenhaPeloLink(codigo: string, senha: string, agora = new Date()) {
  if (!(await conferirCodigoSenha(codigo, agora))) return null; // não gasta scrypt com link inválido
  const senhaHash = await gerarHashSenha(senha);
  return db.$transaction(async (tx) => {
    const tokenHash = hash(codigo);
    const gastou = await tx.codigoEmail.updateMany({
      where: { tokenHash, tipo: "NOVA_SENHA", usadoEm: null, expiraEm: { gt: agora }, usuario: { ativo: true } },
      data: { usadoEm: agora },
    });
    if (!gastou.count) return null;
    const { usuarioId } = await tx.codigoEmail.findUniqueOrThrow({ where: { tokenHash }, select: { usuarioId: true } });
    const usuario = await aplicarSenha(tx, usuarioId, senhaHash, agora);
    // Quem recebeu o link provou que o e-mail é seu: vale como confirmação.
    if (!usuario.emailConfirmadoEm) await tx.usuario.update({ where: { id: usuarioId }, data: { emailConfirmadoEm: agora } });
    return usuario;
  });
}

export async function enviarNovaSenha(usuario: Pessoa) {
  const link = `${await urlBase()}/senha/nova?codigo=${await criarCodigoSenha(usuario.id)}`;
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

/** "Esqueci minha senha": manda o link se a conta existir. Quem pediu nunca fica sabendo. */
export async function processarPedidoDeSenha(email: string) {
  const usuario = await db.usuario.findUnique({ where: { email }, select: { id: true, nome: true, email: true, ativo: true } });
  if (usuario?.ativo) await enviarNovaSenha(usuario);
}

// ---------------------------------------------------------------------------
// Criar conta (cadastro público)
// ---------------------------------------------------------------------------

/**
 * Contas do jeito antigo (antes de CadastroPendente): alguém cadastrou um e-mail que
 * talvez não fosse dele e nunca confirmou. Depois que o link vence, a empresa é
 * apagada para o e-mail ficar livre, MAS só se ela estiver vazia. Qualquer dado,
 * colega ou acesso e nada é apagado: o dono do e-mail usa "Esqueci minha senha".
 */
export async function liberarEmailNuncaUsado(email: string, agora = new Date()) {
  return db.$transaction(async (tx) => {
    await travar(tx, "email", email);
    const usuario = await tx.usuario.findUnique({ where: { email }, include: { _count: { select: { sessoes: true } } } });
    if (!usuario) return true;
    if (usuario.emailConfirmadoEm || usuario.ultimoAcesso || usuario._count.sessoes > 0) return false;
    if (usuario.criadoEm > daqui(agora, -VALIDADE.CADASTRO)) return false;
    if (await tx.codigoEmail.count({ where: { usuarioId: usuario.id, usadoEm: null, expiraEm: { gt: agora } } })) return false;

    const org = await tx.organizacao.findUniqueOrThrow({
      where: { id: usuario.organizacaoId },
      include: {
        _count: {
          select: {
            usuarios: true, clientes: true, contatos: true, negocios: true, servicos: true, turmas: true, participantes: true, atividades: true,
            mensagens: true, conversas: true, sequencias: true, agendadas: true, campanhas: true, descadastros: true, webhooks: true, convites: true,
          },
        },
        whatsapp: { select: { ativo: true } },
      },
    });
    const { usuarios, ...dados } = org._count;
    const vazia = usuarios === 1 && Object.values(dados).every((n) => n === 0) && !org.whatsapp?.ativo;
    if (!org.termosAceitosEm || !vazia) return false;
    await tx.organizacao.delete({ where: { id: org.id } });
    console.log(`[contas] cadastro nunca confirmado e vazio apagado (${org.slug})`);
    return true;
  }, ESPERA_TRAVA);
}

export type PedidoDeCadastro = { empresa: string; ramo: string; nome: string; email: string; telefone: string | null };

/**
 * Guarda o pedido e manda o link para o e-mail. Se o e-mail já tiver conta, avisa o
 * dono dele e não cria nada. O e-mail não leva os textos digitados no formulário:
 * ninguém usa o cadastro para mandar propaganda a outra pessoa.
 */
export async function processarPedidoDeCadastro(p: PedidoDeCadastro, agora = new Date()) {
  const app = nomeDoApp();
  if (!(await liberarEmailNuncaUsado(p.email, agora))) {
    await enviarEmail(
      emailComBotao({
        para: p.email,
        assunto: `Você já tem uma conta no ${app}`,
        saudacao: "Olá!",
        paragrafos: [`Alguém tentou criar uma conta no ${app} com este e-mail, mas ele já tem uma. Nada mudou na sua conta.`, "Se foi você, entre com a sua senha. Se não lembra dela, crie outra."],
        botao: "Criar nova senha",
        link: `${await urlBase()}/senha/esqueci`,
        rodape: "Se não foi você, ignore este e-mail.",
      }),
    );
    return;
  }
  const codigo = novoCodigo();
  const link = `${await urlBase()}/confirmar?codigo=${codigo}`;
  await db.cadastroPendente.create({
    data: { ...p, termosVersao: TERMOS_VERSAO, tokenHash: hash(codigo), expiraEm: daqui(agora, VALIDADE.CADASTRO), criadoEm: agora },
  });
  await enviarEmail(
    emailComBotao({
      para: p.email,
      assunto: `Confirme seu e-mail para entrar no ${app}`,
      saudacao: "Olá!",
      paragrafos: [`Recebemos um cadastro no ${app} com este e-mail. Para criar a conta, confirme que ele é seu e escolha a sua senha.`, "O link vale por 48 horas e funciona uma vez só."],
      botao: "Confirmar e criar a senha",
      link,
      rodape: "Se você não se cadastrou, ignore este e-mail: sem a confirmação, nenhuma conta é criada.",
    }),
  );
}

export async function conferirCadastro(codigo: string, agora = new Date()) {
  if (!formatoValido(codigo)) return null;
  const p = await db.cadastroPendente.findUnique({ where: { tokenHash: hash(codigo) } });
  return p && p.expiraEm > agora ? p : null;
}

/** Gasta o link, cria a empresa e o administrador com a senha que a própria pessoa escolheu. */
export async function concluirCadastro(codigo: string, senha: string, agora = new Date()) {
  const pedido = await conferirCadastro(codigo, agora);
  if (!pedido) return null;
  const { org, admin } = await criarEmpresa(
    {
      nome: pedido.empresa,
      ramo: pedido.ramo,
      telefone: pedido.telefone,
      admin: { nome: pedido.nome, email: pedido.email, senha },
      diasTeste: diasDeTeste(),
      cadastroPublico: { termosVersao: pedido.termosVersao, aceitosEm: pedido.criadoEm },
    },
    agora,
    async (tx) => {
      const gastou = await tx.cadastroPendente.deleteMany({ where: { id: pedido.id, expiraEm: { gt: agora } } });
      if (!gastou.count) throw new ErroCadastro("Este link não vale mais (já foi usado ou passou de 48 horas).");
      // Outros pedidos com o mesmo e-mail perdem o sentido: ele agora tem conta.
      await tx.cadastroPendente.deleteMany({ where: { email: pedido.email } });
    },
  );
  return { org, admin, telefone: pedido.telefone };
}

/** Avisa o dono do sistema (DONO_EMAIL no .env) que uma empresa confirmou o cadastro. */
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
      `Até você liberar, as campanhas dela ficam bloqueadas e ela começa no máximo ${LIMITES.enviosPorDia()} mensagens por dia (por enquanto, no Prisma Studio: Organizacao.campanhasLiberadas).`,
    ].join("\n"),
  });
}

// ---------------------------------------------------------------------------
// Convites (o administrador adiciona gente à própria empresa)
// ---------------------------------------------------------------------------

type Empresa = { id: string; nome: string };

/** Usuários ativos + convites que ainda valem. */
export async function vagasUsadas(banco: Prisma.TransactionClient | typeof db, organizacaoId: string, agora = new Date()) {
  const [usuarios, convites] = await Promise.all([
    banco.usuario.count({ where: { organizacaoId, ativo: true } }),
    banco.convite.count({ where: { organizacaoId, expiraEm: { gt: agora } } }),
  ]);
  return usuarios + convites;
}

export const avisoTetoUsuarios = () => `Limite de ${LIMITES.usuarios()} usuários por empresa (contando os convites). Desative alguém ou cancele um convite.`;

/**
 * Cria o convite na lista da empresa. Só diz que o e-mail "já está" quando está na
 * lista da PRÓPRIA empresa. Se ele tiver conta em outra, o convite aparece na lista
 * do mesmo jeito (e vence): quem descobre é o dono do e-mail.
 */
export async function criarConvite(org: Empresa, dados: { nome: string; email: string; papel: Papel }, agora = new Date()) {
  const codigo = novoCodigo();
  return db.$transaction(async (tx) => {
    await travar(tx, "usuarios", org.id);
    if (await tx.usuario.count({ where: { organizacaoId: org.id, email: dados.email } })) return { erro: "Este e-mail já está na sua lista de usuários." };
    const anterior = await tx.convite.findUnique({ where: { organizacaoId_email: { organizacaoId: org.id, email: dados.email } } });
    if (anterior && anterior.expiraEm > agora) return { erro: "Já existe um convite esperando para este e-mail. Use Reenviar na lista." };
    if ((await vagasUsadas(tx, org.id, agora)) >= LIMITES.usuarios()) return { erro: avisoTetoUsuarios() };
    if (anterior) await tx.convite.delete({ where: { id: anterior.id } });
    const convite = await tx.convite.create({
      data: { organizacaoId: org.id, ...dados, tokenHash: hash(codigo), expiraEm: daqui(agora, VALIDADE.CONVITE), criadoEm: agora },
    });
    return { convite, codigo };
  }, ESPERA_TRAVA);
}

/** Link novo para um convite da empresa (o anterior para de valer). */
export async function renovarConvite(organizacaoId: string, conviteId: string, agora = new Date()) {
  const codigo = novoCodigo();
  const mudou = await db.convite.updateMany({
    where: { id: conviteId, organizacaoId },
    data: { tokenHash: hash(codigo), expiraEm: daqui(agora, VALIDADE.CONVITE) },
  });
  if (!mudou.count) return null;
  return { convite: await db.convite.findUniqueOrThrow({ where: { id: conviteId } }), codigo };
}

/** Manda o convite; se o e-mail já tiver conta, avisa o dono dele (sem link de acesso). */
export async function enviarConvite(convite: { nome: string; email: string }, codigo: string, org: Empresa) {
  const app = nomeDoApp();
  const empresa = nomeParaEmail(org.nome);
  if (await db.usuario.count({ where: { email: convite.email } })) {
    await enviarEmail(
      emailComBotao({
        para: convite.email,
        assunto: `Convite para o ${app}: este e-mail já tem conta`,
        saudacao: "Olá!",
        paragrafos: [`A empresa "${empresa}" convidou este e-mail para o ${app}, mas ele já tem uma conta. Nada mudou na sua conta.`, "Cada e-mail pertence a uma empresa só. Se quiser participar desta também, peça um convite para outro e-mail."],
        botao: "Entrar na minha conta",
        link: `${await urlBase()}/login`,
        rodape: "Se você não conhece esta empresa, ignore este e-mail.",
      }),
    );
    return;
  }
  await enviarEmail(
    emailComBotao({
      para: convite.email,
      assunto: `Convite para entrar no ${app}`,
      saudacao: "Olá!",
      paragrafos: [`A empresa "${empresa}" convidou você para usar o ${app}. Abra o link para escolher a sua senha e entrar.`, "O link vale por 3 dias e funciona uma vez só."],
      botao: "Aceitar o convite",
      link: `${await urlBase()}/convite?codigo=${codigo}`,
      rodape: "Se você não conhece esta empresa, ignore este e-mail: sem o seu aceite, nada é criado.",
    }),
  );
}

export async function conferirConvite(codigo: string, agora = new Date()) {
  if (!formatoValido(codigo)) return null;
  const c = await db.convite.findUnique({ where: { tokenHash: hash(codigo) }, include: { organizacao: true } });
  return c && c.expiraEm > agora ? c : null;
}

/** Gasta o convite e cria o usuário com a senha que a própria pessoa escolheu. */
export async function aceitarConvite(codigo: string, senha: string, agora = new Date()) {
  const convite = await conferirConvite(codigo, agora);
  if (!convite) return null;
  const senhaHash = await gerarHashSenha(senha);
  return db.$transaction(async (tx) => {
    await travar(tx, "usuarios", convite.organizacaoId);
    await travar(tx, "email", convite.email);
    const gastou = await tx.convite.deleteMany({ where: { id: convite.id, tokenHash: hash(codigo), expiraEm: { gt: agora } } });
    if (!gastou.count) return null;
    if (await tx.usuario.count({ where: { email: convite.email } })) throw new ErroCadastro("Este e-mail já tem conta no CRM. Entre com a sua senha.");
    if ((await vagasUsadas(tx, convite.organizacaoId, agora)) >= LIMITES.usuarios()) throw new ErroCadastro("A empresa atingiu o limite de usuários. Fale com quem convidou você.");
    return tx.usuario.create({
      data: { organizacaoId: convite.organizacaoId, nome: convite.nome, email: convite.email, papel: convite.papel, senhaHash, emailConfirmadoEm: agora },
      include: { organizacao: true },
    });
  }, ESPERA_TRAVA);
}

// ---------------------------------------------------------------------------
// Limpeza (chamada pelo relógio)
// ---------------------------------------------------------------------------

/** Apaga pedidos de cadastro vencidos, convites vencidos há 30 dias, links velhos e sessões vencidas. */
export async function limparContasVencidas(agora = new Date()) {
  const ha30dias = daqui(agora, -30 * 24 * HORA);
  await db.cadastroPendente.deleteMany({ where: { expiraEm: { lt: agora } } });
  await db.convite.deleteMany({ where: { expiraEm: { lt: ha30dias } } });
  await db.codigoEmail.deleteMany({ where: { expiraEm: { lt: ha30dias } } });
  await db.sessao.deleteMany({ where: { expiraEm: { lt: agora } } });
}
