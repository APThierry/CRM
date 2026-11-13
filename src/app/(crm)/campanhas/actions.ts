"use server";
// Campanhas: criar, iniciar, pausar, cancelar, testar e reciclagem.
// Só administrador e gestor (podem ser chamadas direto por POST, então conferimos aqui).
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { exigirPapel } from "@/lib/auth";
import { obterAutomacao } from "@/lib/automacao/config";
import { lerDataLocal } from "@/lib/automacao/horario";
import { montarTexto } from "@/lib/campanhas/motor";
import { lerFiltro, montarPublico } from "@/lib/campanhas/publico";
import { prepararReciclagem } from "@/lib/campanhas/reciclagem";
import { db } from "@/lib/db";
import { chaveTelefone, normalizarWhatsapp } from "@/lib/formatar";
import { enviarTexto, ErroWhatsapp } from "@/lib/whatsapp/evolution";

export type Resultado = { erro?: string; ok?: string } | null;
const campo = (f: FormData, nome: string) => String(f.get(nome) ?? "").replace(/\r\n?/g, "\n").trim();

const gestor = () => exigirPapel("ADMIN", "GESTOR");

async function minha(id: string) {
  const eu = await gestor();
  const campanha = await db.campanha.findFirst({ where: { id, organizacaoId: eu.organizacao.id } });
  if (!campanha) throw new Error("Campanha não encontrada.");
  return { eu, campanha };
}

export async function criarCampanha(_estado: Resultado, formData: FormData): Promise<Resultado> {
  const eu = await gestor();
  const org = eu.organizacao.id;
  const nome = campo(formData, "nome").slice(0, 80);
  const texto = campo(formData, "texto").slice(0, 2000);
  if (!nome) return { erro: "Dê um nome para a campanha." };
  if (!texto) return { erro: "Escreva a mensagem." };

  const filtro = lerFiltro(formData);
  const publico = (await montarPublico(org, filtro)).filter((p) => !p.fora);
  if (publico.length === 0) return { erro: "Nenhum cliente com WhatsApp neste público." };

  const campanha = await db.campanha.create({
    data: {
      organizacaoId: org,
      nome,
      texto,
      filtro: filtro as Prisma.InputJsonValue,
      criadoPorId: eu.id,
      destinatarios: {
        create: publico.map((p, ordem) => ({
          clienteId: p.clienteId,
          contatoId: p.contatoId,
          nome: p.nome,
          telefone: p.telefone!,
          chave: p.chave!,
          ordem,
        })),
      },
    },
  });
  redirect(`/campanhas/${campanha.id}`);
}

/** Rascunho ou pausada -> agendada. O relógio começa a enviar na próxima rodada (ou em iniciarEm). */
export async function iniciarCampanha(id: string, formData: FormData) {
  const { campanha } = await minha(id);
  if (!["RASCUNHO", "PAUSADA"].includes(campanha.status)) return;
  const quando = lerDataLocal(campo(formData, "iniciarEm"));
  await db.campanha.update({
    where: { id },
    data: { status: "AGENDADA", iniciarEm: quando && quando > new Date() ? quando : null, motivo: null, proximoEnvioEm: null },
  });
  refresh();
}

export async function pausarCampanha(id: string) {
  const { campanha } = await minha(id);
  if (!["AGENDADA", "ENVIANDO"].includes(campanha.status)) return;
  await db.campanha.update({ where: { id }, data: { status: "PAUSADA", motivo: "pausada pelo gestor" } });
  refresh();
}

export async function cancelarCampanha(id: string) {
  const { campanha } = await minha(id);
  if (["CONCLUIDA", "CANCELADA"].includes(campanha.status)) return;
  await db.$transaction([
    db.destinatarioCampanha.updateMany({ where: { campanhaId: id, status: "PENDENTE" }, data: { status: "IGNORADA", motivo: "campanha cancelada" } }),
    db.campanha.update({ where: { id }, data: { status: "CANCELADA", concluidaEm: new Date(), motivo: null } }),
  ]);
  refresh();
}

/** Apaga um rascunho (os negócios de reciclagem continuam no funil). */
export async function excluirRascunho(id: string) {
  const { campanha } = await minha(id);
  if (campanha.status !== "RASCUNHO") return;
  await db.campanha.delete({ where: { id } });
  redirect("/campanhas");
}

/** Tira alguém da campanha antes de enviar. */
export async function tirarDestinatario(campanhaId: string, destinatarioId: string) {
  await minha(campanhaId);
  await db.destinatarioCampanha.updateMany({
    where: { id: destinatarioId, campanhaId, status: "PENDENTE" },
    data: { status: "IGNORADA", motivo: "retirado pelo gestor" },
  });
  refresh();
}

export async function salvarTexto(id: string, _estado: Resultado, formData: FormData): Promise<Resultado> {
  const { campanha } = await minha(id);
  if (!["RASCUNHO", "PAUSADA"].includes(campanha.status)) return { erro: "Só dá para mudar o texto com a campanha em rascunho ou pausada." };
  const texto = campo(formData, "texto").slice(0, 2000);
  if (!texto) return { erro: "Escreva a mensagem." };
  await db.campanha.update({ where: { id }, data: { texto } });
  refresh();
  return { ok: "Texto salvo." };
}

/** Manda a mensagem (com uma variação sorteada) para um número de teste, na hora. */
export async function enviarTeste(id: string, _estado: Resultado, formData: FormData): Promise<Resultado> {
  const { eu, campanha } = await minha(id);
  const numero = normalizarWhatsapp(campo(formData, "numero"));
  if (!chaveTelefone(numero)) return { erro: "Digite o número com DDD, ex.: (31) 99999-9999." };
  const exemplo = await db.destinatarioCampanha.findFirst({ where: { campanhaId: id }, orderBy: { ordem: "asc" } });
  const texto = montarTexto(campanha.texto, { nome: exemplo?.nome ?? eu.nome, variaveis: exemplo?.variaveis ?? null }, eu.organizacao.nome);
  try {
    // Teste: vai direto para o número, sem entrar na Central de atendimento.
    await enviarTexto(numero!, `*[TESTE]*\n${texto}`);
  } catch (e) {
    return { erro: e instanceof ErroWhatsapp ? e.message : "Não foi possível enviar o teste." };
  }
  return { ok: `Teste enviado para ${numero}.` };
}

// --- Reciclagem ------------------------------------------------------------

export async function salvarReciclagem(_estado: Resultado, formData: FormData): Promise<Resultado> {
  const eu = await gestor();
  await obterAutomacao(eu.organizacao.id); // garante que a configuração existe
  const dias = Number(campo(formData, "reciclagemDias"));
  const texto = campo(formData, "reciclagemTexto").slice(0, 2000);
  if (!Number.isInteger(dias) || dias < 7 || dias > 365) return { erro: "Antecedência: de 7 a 365 dias." };
  if (!texto) return { erro: "Escreva a mensagem de reciclagem." };
  await db.configuracaoAutomacao.update({ where: { organizacaoId: eu.organizacao.id }, data: { reciclagemDias: dias, reciclagemTexto: texto } });
  refresh();
  return { ok: "Configuração da reciclagem salva." };
}

export async function prepararCampanhaReciclagem() {
  const eu = await gestor();
  const r = await prepararReciclagem(eu);
  if (!r) redirect("/campanhas?reciclagem=vazia");
  redirect(`/campanhas/${r.campanhaId}?preparada=${r.negocios}`);
}
