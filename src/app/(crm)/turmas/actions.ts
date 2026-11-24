"use server";
// Gravações de turmas, inscrições e certificados.
// Toda action confere o papel (administrador, gestor ou instrutor) e se a
// turma/matrícula pertence à organização atual.
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { exigirCuidadoDeTurmas } from "@/lib/auth";
import { calcularValidade, emitirCertificado } from "@/lib/certificados";
import { db } from "@/lib/db";
import { deInputData } from "@/lib/formatar";
import { inteiro, opcional } from "@/lib/validar";
import { dadosCertificado, dispararComDados } from "@/lib/webhooks/disparar";
import type { Modalidade, StatusTurma } from "@/generated/prisma/client";

const texto = (f: FormData, campo: string, maximo = 200) => opcional(f.get(campo), maximo);

const MODALIDADES: Modalidade[] = ["PRESENCIAL", "EAD", "HIBRIDO"];
const STATUS: StatusTurma[] = ["PLANEJADA", "CONFIRMADA", "REALIZADA", "CANCELADA"];

async function turmaDaOrganizacao(turmaId: string) {
  const { organizacao: org } = await exigirCuidadoDeTurmas();
  const turma = await db.turma.findFirst({ where: { id: turmaId, organizacaoId: org.id }, include: { servico: true } });
  if (!turma) throw new Error("Turma não encontrada.");
  return { org, turma };
}

async function matriculaDaOrganizacao(matriculaId: string) {
  const { organizacao: org } = await exigirCuidadoDeTurmas();
  const matricula = await db.matricula.findFirst({
    where: { id: matriculaId, turma: { organizacaoId: org.id } },
    include: { turma: { include: { servico: true } } },
  });
  if (!matricula) throw new Error("Inscrição não encontrada.");
  return { org, matricula };
}

/** Cria (turmaId = null) ou edita uma turma. */
export async function salvarTurma(turmaId: string | null, formData: FormData) {
  const { organizacao: org } = await exigirCuidadoDeTurmas();
  if (turmaId) await turmaDaOrganizacao(turmaId); // a turma é desta empresa?

  const servicoId = String(formData.get("servicoId") ?? "");
  const servico = await db.servico.findFirst({ where: { id: servicoId, organizacaoId: org.id } });
  if (!servico) throw new Error("Escolha um curso.");

  const dataInicio = deInputData(texto(formData, "dataInicio"));
  if (!dataInicio) throw new Error("A data de início é obrigatória.");

  // Cliente e instrutor são opcionais, mas precisam ser da mesma organização.
  const clienteId = texto(formData, "clienteId");
  const instrutorId = texto(formData, "instrutorId");
  const [cliente, instrutor] = await Promise.all([
    clienteId ? db.cliente.findFirst({ where: { id: clienteId, organizacaoId: org.id } }) : null,
    instrutorId ? db.usuario.findFirst({ where: { id: instrutorId, organizacaoId: org.id } }) : null,
  ]);

  const dados = {
    servicoId: servico.id,
    clienteId: cliente?.id ?? null,
    instrutorId: instrutor?.id ?? null,
    dataInicio,
    dataFim: deInputData(texto(formData, "dataFim")),
    local: texto(formData, "local"),
    vagas: inteiro(formData.get("vagas"), 1, 10_000),
    modalidade: MODALIDADES.find((m) => m === formData.get("modalidade")) ?? "PRESENCIAL",
    status: STATUS.find((s) => s === formData.get("status")) ?? "PLANEJADA",
    observacoes: texto(formData, "observacoes", 5000),
  };

  let id = turmaId;
  if (turmaId) {
    const turma = await db.turma.update({ where: { id: turmaId }, data: dados });
    // Se a data ou o curso mudaram, recalcula a validade dos aprovados.
    const validade = calcularValidade(turma, servico.validadeMeses);
    await db.matricula.updateMany({ where: { turmaId, aprovado: true }, data: { validadeAte: validade } });
  } else {
    id = (await db.turma.create({ data: { ...dados, organizacaoId: org.id } })).id;
  }
  redirect(`/turmas/${id}`);
}

export async function alterarStatusTurma(turmaId: string, status: StatusTurma) {
  await turmaDaOrganizacao(turmaId);
  if (!STATUS.includes(status)) throw new Error("Status inválido.");
  await db.turma.update({ where: { id: turmaId }, data: { status } });
  refresh();
}

/**
 * Inscreve um aluno. Se já existir um participante com o mesmo CPF na
 * organização, reaproveita o cadastro (assim o histórico do aluno fica junto).
 */
export async function inscreverParticipante(turmaId: string, formData: FormData) {
  const { org, turma } = await turmaDaOrganizacao(turmaId);
  const nome = texto(formData, "nome");
  if (!nome) return;
  const cpf = texto(formData, "cpf", 30)?.replace(/\D/g, "") || null;

  const clienteIdForm = texto(formData, "clienteId");
  const cliente = clienteIdForm
    ? await db.cliente.findFirst({ where: { id: clienteIdForm, organizacaoId: org.id } })
    : null;
  const clienteId = cliente?.id ?? turma.clienteId;

  let participante = cpf ? await db.participante.findFirst({ where: { organizacaoId: org.id, cpf } }) : null;
  if (!participante) {
    participante = await db.participante.create({
      data: {
        organizacaoId: org.id,
        nome,
        cpf,
        telefone: texto(formData, "telefone", 30),
        email: texto(formData, "email", 254),
        clienteId,
      },
    });
  }

  // @@unique([turmaId, participanteId]) impede inscrever a mesma pessoa duas vezes.
  await db.matricula.upsert({
    where: { turmaId_participanteId: { turmaId, participanteId: participante.id } },
    create: { turmaId, participanteId: participante.id },
    update: {},
  });
  refresh();
}

export async function removerInscricao(matriculaId: string) {
  const { matricula } = await matriculaDaOrganizacao(matriculaId);
  if (matricula.certificadoNumero) throw new Error("Não é possível remover: o certificado já foi emitido.");
  await db.matricula.delete({ where: { id: matriculaId } });
  refresh();
}

/** valor: true = presente, false = faltou, null = não registrado. */
export async function marcarPresenca(matriculaId: string, valor: boolean | null) {
  await matriculaDaOrganizacao(matriculaId);
  await db.matricula.update({ where: { id: matriculaId }, data: { presente: valor } });
  refresh();
}

/**
 * Aprova ou reprova. Ao aprovar, emite o certificado: gera o número (uma única
 * vez) e calcula a validade. Ao reprovar, a validade é removida.
 */
export async function definirResultado(matriculaId: string, aprovado: boolean | null) {
  const { org, matricula } = await matriculaDaOrganizacao(matriculaId);

  if (aprovado) {
    const novo = await emitirCertificado(org, matriculaId, {
      presente: true,
      validadeAte: calcularValidade(matricula.turma, matricula.turma.servico.validadeMeses),
    });
    if (novo) await dispararComDados(org.id, "certificado.emitido", () => dadosCertificado(matriculaId));
  } else {
    await db.matricula.update({ where: { id: matriculaId }, data: { aprovado, validadeAte: null } });
  }
  refresh();
}

/** Aprova todos os presentes de uma vez e marca a turma como realizada. */
export async function concluirTurma(turmaId: string) {
  const { org, turma } = await turmaDaOrganizacao(turmaId);
  const pendentes = await db.matricula.findMany({
    where: { turmaId, presente: true, aprovado: null },
    orderBy: { participante: { nome: "asc" } },
  });
  const validade = calcularValidade(turma, turma.servico.validadeMeses);
  for (const m of pendentes) {
    const novo = await emitirCertificado(org, m.id, { validadeAte: validade });
    if (novo) await dispararComDados(org.id, "certificado.emitido", () => dadosCertificado(m.id));
  }
  await db.turma.update({ where: { id: turmaId }, data: { status: "REALIZADA" } });
  refresh();
}
