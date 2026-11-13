"use server";
// Ações da Central de atendimento. Todas conferem o login e se a pessoa pode
// ver a conversa (src/lib/atendimento.ts) — podem ser chamadas direto por POST.
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getUsuarioAtual } from "@/lib/auth";
import { buscarConversa, veTodasConversas } from "@/lib/atendimento";
import { db } from "@/lib/db";
import { chaveTelefone, normalizarWhatsapp } from "@/lib/formatar";
import { enviarNaConversa, type ResultadoEnvio } from "@/lib/whatsapp/enviar";
import { obterConversa } from "@/lib/whatsapp/mensagens";

const campo = (f: FormData, nome: string) => String(f.get(nome) ?? "").trim();

async function conversaPermitida(id: string) {
  const eu = await getUsuarioAtual();
  const conversa = await buscarConversa(eu, id);
  if (!conversa) throw new Error("Conversa não encontrada ou sem permissão.");
  return { eu, conversa };
}

// --- Mensagens ---------------------------------------------------------------

export async function enviarMensagem(conversaId: string, _estado: ResultadoEnvio | null, formData: FormData) {
  const { eu, conversa } = await conversaPermitida(conversaId);
  const arquivo = formData.get("arquivo");
  const resultado = await enviarNaConversa(eu, conversa, {
    texto: campo(formData, "texto"),
    arquivo: arquivo instanceof File ? arquivo : null,
  });
  if (resultado.ok) refresh();
  return resultado;
}

/** Abre (ou cria) a conversa com um número digitado. Quem abriu vira o atendente. */
export async function iniciarConversa(_estado: { erro?: string } | null, formData: FormData): Promise<{ erro?: string }> {
  const eu = await getUsuarioAtual();
  const numero = normalizarWhatsapp(campo(formData, "numero"));
  if (!numero || !chaveTelefone(numero)) return { erro: "Número inválido. Use DDD + número, ex.: (31) 99999-9999." };
  const conversa = await obterConversa(eu.organizacao.id, numero);
  // Conversa de outro atendente: quem não é gestor não pode abrir.
  if (!(await buscarConversa(eu, conversa.id))) return { erro: "A conversa com este número está com outro atendente." };
  if (!conversa.atendenteId) await db.conversa.update({ where: { id: conversa.id }, data: { atendenteId: eu.id } });
  redirect(`/atendimento?c=${conversa.id}`);
}

/** Chamado quando alguém abre a conversa: zera o contador de não lidas. */
export async function marcarLida(conversaId: string) {
  const { conversa } = await conversaPermitida(conversaId);
  if (conversa.naoLidas > 0) await db.conversa.update({ where: { id: conversa.id }, data: { naoLidas: 0 } });
}

// --- Atendente e situação ----------------------------------------------------

export async function assumirConversa(conversaId: string) {
  const { eu, conversa } = await conversaPermitida(conversaId);
  if (conversa.atendenteId && conversa.atendenteId !== eu.id && !veTodasConversas(eu.papel)) {
    throw new Error("Esta conversa já tem atendente.");
  }
  await db.conversa.update({ where: { id: conversa.id }, data: { atendenteId: eu.id, status: "ABERTA" } });
  refresh();
}

/** Passa a conversa para outra pessoa (ou devolve para a fila). */
export async function transferirConversa(conversaId: string, formData: FormData) {
  const { eu, conversa } = await conversaPermitida(conversaId);
  // Quem não é gestor só transfere as conversas que são dele.
  if (!veTodasConversas(eu.papel) && conversa.atendenteId !== eu.id) throw new Error("Sem permissão para transferir.");
  const destino = campo(formData, "atendenteId") || null;
  if (destino) {
    const ok = await db.usuario.findFirst({ where: { id: destino, organizacaoId: eu.organizacao.id, ativo: true } });
    if (!ok) throw new Error("Atendente não encontrado.");
  }
  await db.conversa.update({ where: { id: conversa.id }, data: { atendenteId: destino } });
  refresh();
}

export async function finalizarConversa(conversaId: string) {
  const { conversa } = await conversaPermitida(conversaId);
  await db.conversa.update({ where: { id: conversa.id }, data: { status: "FINALIZADA", naoLidas: 0 } });
  refresh();
}

export async function reabrirConversa(conversaId: string) {
  const { conversa } = await conversaPermitida(conversaId);
  await db.conversa.update({ where: { id: conversa.id }, data: { status: "ABERTA" } });
  refresh();
}

// --- Etiquetas ----------------------------------------------------------------

export async function alternarEtiqueta(conversaId: string, etiquetaId: string) {
  const { eu, conversa } = await conversaPermitida(conversaId);
  const etiqueta = await db.etiqueta.findFirst({ where: { id: etiquetaId, organizacaoId: eu.organizacao.id } });
  if (!etiqueta) throw new Error("Etiqueta não encontrada.");
  const tem = await db.conversa.count({ where: { id: conversa.id, etiquetas: { some: { id: etiquetaId } } } });
  await db.conversa.update({
    where: { id: conversa.id },
    data: { etiquetas: tem ? { disconnect: { id: etiquetaId } } : { connect: { id: etiquetaId } } },
  });
  refresh();
}

// --- Cliente e funil ------------------------------------------------------------

/** Liga a conversa (e as mensagens dela) a um cliente. */
async function ligarAoCliente(conversaId: string, clienteId: string, contatoId: string | null) {
  await db.$transaction([
    db.conversa.update({ where: { id: conversaId }, data: { clienteId, contatoId } }),
    db.mensagemWhatsapp.updateMany({ where: { conversaId }, data: { clienteId, contatoId } }),
  ]);
}

/** Cadastra um cliente novo a partir de um número desconhecido. */
export async function cadastrarClienteDaConversa(conversaId: string, formData: FormData) {
  const { eu, conversa } = await conversaPermitida(conversaId);
  if (conversa.clienteId) throw new Error("Esta conversa já está ligada a um cliente.");
  const nome = campo(formData, "nome");
  if (!nome) throw new Error("Informe o nome do cliente.");
  const tipo = campo(formData, "tipo") === "PF" ? "PF" : "PJ";
  const nomeContato = campo(formData, "contatoNome") || (tipo === "PF" ? nome : conversa.nome) || nome;
  const whatsapp = normalizarWhatsapp(conversa.telefone);

  const cliente = await db.cliente.create({
    data: {
      organizacaoId: eu.organizacao.id,
      responsavelId: eu.id,
      tipo,
      nome,
      whatsapp,
      cidade: campo(formData, "cidade") || null,
      uf: campo(formData, "uf").toUpperCase() || null,
      origem: "WhatsApp",
      contatos: {
        create: { organizacaoId: eu.organizacao.id, nome: nomeContato, whatsapp, principal: true },
      },
    },
    include: { contatos: true },
  });
  await ligarAoCliente(conversa.id, cliente.id, cliente.contatos[0]?.id ?? null);
  refresh();
}

/** Liga a conversa a um cliente que já existe (ex.: outro funcionário da empresa). */
export async function vincularClienteExistente(conversaId: string, formData: FormData) {
  const { eu, conversa } = await conversaPermitida(conversaId);
  const cliente = await db.cliente.findFirst({ where: { id: campo(formData, "clienteId"), organizacaoId: eu.organizacao.id } });
  if (!cliente) throw new Error("Cliente não encontrado.");

  // Cadastra o número como contato do cliente, para as próximas mensagens já chegarem ligadas.
  const whatsapp = normalizarWhatsapp(conversa.telefone);
  const contato = await db.contato.create({
    data: {
      organizacaoId: eu.organizacao.id,
      clienteId: cliente.id,
      nome: campo(formData, "contatoNome") || conversa.nome || "Contato do WhatsApp",
      whatsapp,
    },
  });
  await ligarAoCliente(conversa.id, cliente.id, contato.id);
  refresh();
}

export async function desvincularCliente(conversaId: string) {
  const { conversa } = await conversaPermitida(conversaId);
  await db.$transaction([
    db.conversa.update({ where: { id: conversa.id }, data: { clienteId: null, contatoId: null } }),
    db.mensagemWhatsapp.updateMany({ where: { conversaId: conversa.id }, data: { clienteId: null, contatoId: null } }),
  ]);
  refresh();
}

/** Cria um negócio no funil para o cliente da conversa. */
export async function criarNegocioDaConversa(conversaId: string, formData: FormData) {
  const { eu, conversa } = await conversaPermitida(conversaId);
  if (!conversa.clienteId) throw new Error("Cadastre ou vincule o cliente primeiro.");
  const org = eu.organizacao.id;
  const servicoId = campo(formData, "servicoId") || null;
  const [cliente, primeiraEtapa, servico] = await Promise.all([
    db.cliente.findFirst({ where: { id: conversa.clienteId, organizacaoId: org } }),
    db.etapaFunil.findFirst({ where: { organizacaoId: org, tipo: "ABERTA" }, orderBy: { ordem: "asc" } }),
    servicoId ? db.servico.findFirst({ where: { id: servicoId, organizacaoId: org } }) : null,
  ]);
  if (!cliente || !primeiraEtapa) throw new Error("Cliente ou funil não encontrados.");
  const valor = Number(campo(formData, "valor").replace(/\./g, "").replace(",", ".")) || 0;

  await db.negocio.create({
    data: {
      organizacaoId: org,
      titulo: `${servico?.nome ?? "Treinamento"} - ${cliente.nome}`,
      clienteId: cliente.id,
      contatoId: conversa.contatoId,
      servicoId: servico?.id ?? null,
      etapaId: primeiraEtapa.id,
      responsavelId: eu.id,
      valor,
      quantidadeAlunos: Number(campo(formData, "quantidadeAlunos")) || null,
    },
  });
  refresh();
}
