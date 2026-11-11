"use server";
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { getOrganizacaoAtual } from "@/lib/org";

/** Move um negócio para outra etapa (chamado ao arrastar o cartão no Kanban). */
export async function moverNegocio(negocioId: string, etapaId: string) {
  const org = await getOrganizacaoAtual();
  const [negocio, etapa] = await Promise.all([
    db.negocio.findFirst({ where: { id: negocioId, organizacaoId: org.id } }),
    db.etapaFunil.findFirst({ where: { id: etapaId, organizacaoId: org.id } }),
  ]);
  if (!negocio || !etapa) throw new Error("Negócio ou etapa não encontrados.");

  await db.negocio.update({
    where: { id: negocioId },
    data: {
      etapaId,
      // Ao entrar em "Fechado" ou "Perdido" registramos a data; ao reabrir, limpamos.
      fechadoEm: etapa.tipo === "ABERTA" ? null : negocio.fechadoEm ?? new Date(),
    },
  });
  refresh();
}

export async function criarNegocio(formData: FormData) {
  const org = await getOrganizacaoAtual();
  const clienteId = String(formData.get("clienteId") ?? "");
  const servicoId = String(formData.get("servicoId") ?? "") || null;

  const [cliente, primeiraEtapa, servico] = await Promise.all([
    db.cliente.findFirst({ where: { id: clienteId, organizacaoId: org.id } }),
    db.etapaFunil.findFirst({ where: { organizacaoId: org.id, tipo: "ABERTA" }, orderBy: { ordem: "asc" } }),
    servicoId ? db.servico.findFirst({ where: { id: servicoId, organizacaoId: org.id } }) : null,
  ]);
  if (!cliente || !primeiraEtapa) throw new Error("Cliente ou funil não encontrados.");

  const alunos = Number(formData.get("quantidadeAlunos")) || null;
  const valor = Number(String(formData.get("valor") ?? "0").replace(/\./g, "").replace(",", ".")) || 0;
  const titulo = String(formData.get("titulo") ?? "").trim() || `${servico?.nome ?? "Treinamento"} - ${cliente.nome}`;

  await db.negocio.create({
    data: {
      organizacaoId: org.id,
      titulo,
      clienteId: cliente.id,
      servicoId: servico?.id ?? null,
      etapaId: primeiraEtapa.id,
      valor,
      quantidadeAlunos: alunos,
    },
  });
  refresh();
}
