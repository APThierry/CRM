"use server";
// Tela Automação: horário de atendimento, chatbot e sequências de follow-up.
// Só administrador e gestor alteram (podem ser chamadas direto por POST).
import { refresh } from "next/cache";
import { getUsuarioAtual } from "@/lib/auth";
import { veTodasConversas } from "@/lib/atendimento";
import { obterAutomacao } from "@/lib/automacao/config";
import { HORARIOS_PADRAO, horaValida, type Horarios } from "@/lib/automacao/horario";
import { db } from "@/lib/db";

export type Resultado = { erro?: string; ok?: string } | null;
// Textos de formulário chegam com "\r\n"; o WhatsApp usa só "\n".
const campo = (f: FormData, nome: string) => String(f.get(nome) ?? "").replace(/\r\n?/g, "\n").trim();

async function gestor() {
  const eu = await getUsuarioAtual();
  if (!veTodasConversas(eu.papel)) throw new Error("Só administrador ou gestor altera a automação.");
  await obterAutomacao(eu.organizacao.id); // garante que a configuração existe
  return eu;
}

export async function salvarHorario(_estado: Resultado, formData: FormData): Promise<Resultado> {
  const eu = await gestor();
  const horarios: Horarios = [];
  for (let i = 0; i < 7; i++) {
    const aberto = formData.get(`aberto${i}`) === "on";
    const inicio = campo(formData, `inicio${i}`) || HORARIOS_PADRAO[i].inicio;
    const fim = campo(formData, `fim${i}`) || HORARIOS_PADRAO[i].fim;
    if (!horaValida(inicio) || !horaValida(fim)) return { erro: "Use horas no formato 08:00." };
    if (aberto && fim <= inicio) return { erro: "O fim do expediente precisa ser depois do início." };
    horarios.push({ aberto, inicio, fim });
  }
  const ativo = formData.get("horarioAtivo") === "on";
  const mensagem = campo(formData, "mensagemForaHorario");
  if (ativo && !mensagem) return { erro: "Escreva a mensagem de fora do horário." };
  if (ativo && !horarios.some((h) => h.aberto)) return { erro: "Marque pelo menos um dia de atendimento." };
  await db.configuracaoAutomacao.update({
    where: { organizacaoId: eu.organizacao.id },
    data: { horarioAtivo: ativo, horarios, mensagemForaHorario: mensagem.slice(0, 1000) },
  });
  refresh();
  return { ok: ativo ? "Horário salvo. O aviso de fora do horário está LIGADO." : "Horário salvo (aviso desligado)." };
}

export async function salvarBot(_estado: Resultado, formData: FormData): Promise<Resultado> {
  const eu = await gestor();
  const ativo = formData.get("botAtivo") === "on";
  const boasVindas = campo(formData, "botBoasVindas");
  const horas = Number(campo(formData, "botReativarHoras"));
  if (!boasVindas) return { erro: "Escreva a mensagem de boas-vindas." };
  if (!Number.isInteger(horas) || horas < 1 || horas > 720) return { erro: "Horas para reapresentar o menu: de 1 a 720." };
  if (ativo && (await db.opcaoBot.count({ where: { organizacaoId: eu.organizacao.id } })) === 0) {
    return { erro: "Crie pelo menos uma opção antes de ligar o chatbot." };
  }
  await db.configuracaoAutomacao.update({
    where: { organizacaoId: eu.organizacao.id },
    data: { botAtivo: ativo, botBoasVindas: boasVindas.slice(0, 1000), botReativarHoras: horas },
  });
  refresh();
  return { ok: ativo ? "Chatbot salvo e LIGADO." : "Chatbot salvo (desligado)." };
}

export async function criarOpcao(_estado: Resultado, formData: FormData): Promise<Resultado> {
  const eu = await gestor();
  const org = eu.organizacao.id;
  const rotulo = campo(formData, "rotulo").slice(0, 60);
  if (!rotulo) return { erro: "Escreva o nome da opção." };
  const etiquetaId = campo(formData, "etiquetaId") || null;
  const atendenteId = campo(formData, "atendenteId") || null;
  // Só aceita etiqueta e atendente da própria empresa.
  if (etiquetaId && !(await db.etiqueta.findFirst({ where: { id: etiquetaId, organizacaoId: org } }))) return { erro: "Etiqueta inválida." };
  if (atendenteId && !(await db.usuario.findFirst({ where: { id: atendenteId, organizacaoId: org, ativo: true } }))) {
    return { erro: "Atendente inválido." };
  }
  const ultima = await db.opcaoBot.findFirst({ where: { organizacaoId: org }, orderBy: { ordem: "desc" } });
  if ((ultima?.ordem ?? 0) >= 9) return { erro: "O menu aceita até 9 opções." };
  await db.opcaoBot.create({
    data: { organizacaoId: org, ordem: (ultima?.ordem ?? 0) + 1, rotulo, resposta: campo(formData, "resposta").slice(0, 1000) || null, etiquetaId, atendenteId },
  });
  refresh();
  return { ok: `Opção "${rotulo}" criada.` };
}

/** Apaga a opção e renumera as outras (1, 2, 3…). */
export async function apagarOpcao(id: string) {
  const eu = await gestor();
  const org = eu.organizacao.id;
  await db.opcaoBot.deleteMany({ where: { id, organizacaoId: org } });
  const restantes = await db.opcaoBot.findMany({ where: { organizacaoId: org }, orderBy: { ordem: "asc" } });
  await db.$transaction(restantes.map((o, i) => db.opcaoBot.update({ where: { id: o.id }, data: { ordem: i + 1 } })));
  refresh();
}

/** Sobe a opção uma posição no menu. */
export async function subirOpcao(id: string) {
  const eu = await gestor();
  const opcoes = await db.opcaoBot.findMany({ where: { organizacaoId: eu.organizacao.id }, orderBy: { ordem: "asc" } });
  const i = opcoes.findIndex((o) => o.id === id);
  if (i <= 0) return;
  [opcoes[i - 1], opcoes[i]] = [opcoes[i], opcoes[i - 1]];
  await db.$transaction(opcoes.map((o, n) => db.opcaoBot.update({ where: { id: o.id }, data: { ordem: n + 1 } })));
  refresh();
}

const MAX_PASSOS = 5; // igual ao formulário (formularios.tsx)

export async function criarSequencia(_estado: Resultado, formData: FormData): Promise<Resultado> {
  const eu = await gestor();
  const nome = campo(formData, "nome").slice(0, 60);
  if (!nome) return { erro: "Dê um nome para a sequência." };
  const passos: { esperaMinutos: number; texto: string }[] = [];
  for (let i = 1; i <= MAX_PASSOS; i++) {
    const texto = campo(formData, `texto${i}`);
    if (!texto) continue;
    const dias = Number(campo(formData, `dias${i}`) || 0);
    const horas = Number(campo(formData, `horas${i}`) || 0);
    if (!Number.isFinite(dias) || !Number.isFinite(horas) || dias < 0 || horas < 0) return { erro: `Mensagem ${i}: tempo inválido.` };
    const esperaMinutos = Math.round((dias * 24 + horas) * 60);
    if (esperaMinutos < 1) return { erro: `Mensagem ${i}: diga depois de quanto tempo enviar.` };
    passos.push({ esperaMinutos, texto: texto.slice(0, 1000) });
  }
  if (passos.length === 0) return { erro: "Escreva pelo menos uma mensagem." };
  passos.sort((a, b) => a.esperaMinutos - b.esperaMinutos);
  const existe = await db.sequencia.findFirst({ where: { organizacaoId: eu.organizacao.id, nome: { equals: nome, mode: "insensitive" } } });
  if (existe) return { erro: "Já existe uma sequência com esse nome." };
  await db.sequencia.create({
    data: {
      organizacaoId: eu.organizacao.id,
      nome,
      passos: { create: passos.map((p, i) => ({ ...p, ordem: i + 1 })) },
    },
  });
  refresh();
  return { ok: `Sequência "${nome}" criada com ${passos.length} mensagem(ns).` };
}

/** Apaga a sequência e cancela o que ela ainda tinha para enviar. */
export async function apagarSequencia(id: string) {
  const eu = await gestor();
  const s = await db.sequencia.findFirst({ where: { id, organizacaoId: eu.organizacao.id } });
  if (!s) return;
  await db.$transaction([
    db.mensagemAgendada.updateMany({ where: { sequenciaId: id, status: "PENDENTE" }, data: { status: "CANCELADA", motivo: "a sequência foi apagada" } }),
    db.sequencia.delete({ where: { id } }),
  ]);
  refresh();
}
