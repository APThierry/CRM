// Dados de exemplo para os testes: uma empresa com clientes, conversa, funil, turma,
// certificado, campanha, webhook... Tudo com nomes próprios, para conferir que uma
// empresa não enxerga a outra. Usado só no banco descartável (./ambiente-teste.mts).
import { randomBytes } from "node:crypto";

export const { db } = await import("../../src/lib/db");
const { criarEmpresa } = await import("../../src/lib/empresas/criar");
const { gerarHashSenha } = await import("../../src/lib/senha");

export const SENHA_TESTE = "senha-de-teste-123";
const hashPadrao = await gerarHashSenha(SENHA_TESTE);

export const sufixo = () => randomBytes(3).toString("hex");
/** Celular de Belo Horizonte, 13 dígitos, sempre diferente. */
let proximoNumero = Math.floor(1_000_000 + Math.random() * 8_000_000);
export const numeroNovo = () => `553190${proximoNumero++}`;

/** Empresa com um administrador que já entra (senha SENHA_TESTE). */
export async function empresa(nome: string, { aprovada = true, email }: { aprovada?: boolean; email?: string } = {}) {
  const r = await criarEmpresa({
    nome,
    admin: { nome: `Admin ${nome}`, email: email ?? `admin-${sufixo()}@empresa.test`, senha: SENHA_TESTE },
    ...(aprovada ? {} : { diasTeste: 14, cadastroPublico: { termosVersao: "teste" } }),
  });
  return { org: r.org, admin: r.admin };
}

/** Mais um usuário ativo e confirmado (senha SENHA_TESTE). */
export function usuario(organizacaoId: string, papel: "ADMIN" | "GESTOR" | "VENDEDOR" | "INSTRUTOR", nome = `${papel} ${sufixo()}`) {
  return db.usuario.create({
    data: { organizacaoId, nome, email: `${papel.toLowerCase()}-${sufixo()}@empresa.test`, papel, senhaHash: hashPadrao, emailConfirmadoEm: new Date() },
  });
}

export function usuarioAtual(u: { id: string; nome: string; email: string; papel: "ADMIN" | "GESTOR" | "VENDEDOR" | "INSTRUTOR" }, org: { id: string; nome: string; slug: string }) {
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel, assinaturaWhatsapp: false, organizacao: { id: org.id, nome: org.nome, slug: org.slug } };
}

export async function conversa(organizacaoId: string, nome = `Contato ${sufixo()}`) {
  const telefone = numeroNovo();
  return db.conversa.create({ data: { organizacaoId, telefone, chave: telefone.slice(2, 4) + telefone.slice(-8), nome } });
}

/** Um pouco de tudo, com a `marca` em cada nome. Devolve os ids. */
export async function dadosCompletos(organizacaoId: string, marca: string) {
  const o = { organizacaoId };
  const etapas = await db.etapaFunil.findMany({ where: o, orderBy: { ordem: "asc" } });
  const telefone = numeroNovo();
  const cliente = await db.cliente.create({ data: { ...o, nome: `Cliente ${marca}`, whatsapp: telefone, cidade: "Belo Horizonte", segmento: "Indústria" } });
  const contato = await db.contato.create({ data: { ...o, clienteId: cliente.id, nome: `Contato ${marca}`, whatsapp: telefone, principal: true } });
  for (let i = 1; i <= 2; i++) await db.cliente.create({ data: { ...o, nome: `Extra ${i} ${marca}`, whatsapp: numeroNovo() } });
  const servico = await db.servico.create({ data: { ...o, nome: `Curso ${marca}`, cargaHoraria: 16, validadeMeses: 12 } });
  const negocio = await db.negocio.create({ data: { ...o, titulo: `Negócio ${marca}`, clienteId: cliente.id, etapaId: etapas[0].id, valor: 1500 } });
  const turma = await db.turma.create({ data: { ...o, servicoId: servico.id, clienteId: cliente.id, dataInicio: new Date(Date.now() + 5 * 86_400_000), local: `Local ${marca}` } });
  const participante = await db.participante.create({ data: { ...o, nome: `Aluno ${marca}`, clienteId: cliente.id } });
  const matricula = await db.matricula.create({ data: { turmaId: turma.id, participanteId: participante.id } });
  const formado = await db.participante.create({ data: { ...o, nome: `Formado ${marca}`, clienteId: cliente.id } });
  const certificado = await db.matricula.create({
    data: { turmaId: turma.id, participanteId: formado.id, presente: true, aprovado: true, certificadoNumero: `XX-2026-${sufixo()}`, emitidoEm: new Date(), validadeAte: new Date(Date.now() + 20 * 86_400_000) },
  });
  const atividade = await db.atividade.create({ data: { ...o, tipo: "TAREFA", descricao: `Tarefa ${marca}`, clienteId: cliente.id, agendadaPara: new Date(Date.now() - 3600_000) } });
  const conv = await db.conversa.create({
    data: { ...o, telefone, chave: telefone.slice(2, 4) + telefone.slice(-8), nome: `Perfil ${marca}`, clienteId: cliente.id, contatoId: contato.id, ultimaTexto: `Mensagem ${marca}` },
  });
  await db.mensagemWhatsapp.create({ data: { ...o, conversaId: conv.id, clienteId: cliente.id, telefone, direcao: "ENTRADA", conteudo: `Mensagem ${marca}`, criadoEm: new Date(Date.now() - 48 * 3600_000) } });
  const etiqueta = await db.etiqueta.create({ data: { ...o, nome: `Etiqueta ${marca}` } });
  const resposta = await db.respostaRapida.create({ data: { ...o, atalho: `atalho-${sufixo()}`, texto: `Resposta ${marca}` } });
  const opcao = await db.opcaoBot.findFirstOrThrow({ where: o });
  const sequencia = await db.sequencia.create({ data: { ...o, nome: `Sequência ${marca}`, passos: { create: [{ ordem: 1, esperaMinutos: 60, texto: `Passo ${marca}` }] } } });
  const agendada = await db.mensagemAgendada.create({ data: { ...o, conversaId: conv.id, texto: `Agendada ${marca}`, enviarEm: new Date(Date.now() + 86_400_000) } });
  const campanha = await db.campanha.create({
    data: {
      ...o,
      nome: `Campanha ${marca}`,
      texto: `Texto ${marca}`,
      destinatarios: { create: [{ clienteId: cliente.id, nome: `Contato ${marca}`, telefone, chave: conv.chave, ordem: 0 }] },
    },
    include: { destinatarios: true },
  });
  const webhook = await db.webhook.create({ data: { ...o, nome: `Webhook ${marca}`, url: "https://93.184.216.34/gancho", segredo: `segredo-${marca}`, eventos: ["negocio.ganho"] } });
  const entrega = await db.entregaWebhook.create({ data: { webhookId: webhook.id, evento: "negocio.ganho", payload: { x: 1 }, status: "FALHOU", tentativas: 6, erro: "não consegui conectar" } });
  return { etapas, cliente, contato, servico, negocio, turma, participante, matricula, certificado, atividade, conversa: conv, etiqueta, resposta, opcao, sequencia, agendada, campanha, webhook, entrega, marca };
}
