"use server";
// Server Actions: funções que rodam no servidor e são chamadas pelos formulários.
// IMPORTANTE: elas podem ser chamadas diretamente por POST, então sempre
// conferimos se o registro pertence à organização atual.
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { normalizarWhatsapp } from "@/lib/formatar";
import { getOrganizacaoAtual } from "@/lib/org";
import type { TipoAtividade } from "@/generated/prisma/client";

const texto = (f: FormData, campo: string) => {
  const v = String(f.get(campo) ?? "").trim();
  return v === "" ? null : v;
};

export async function criarCliente(formData: FormData) {
  const org = await getOrganizacaoAtual();
  const nome = texto(formData, "nome");
  if (!nome) throw new Error("O nome do cliente é obrigatório.");

  const whatsapp = normalizarWhatsapp(texto(formData, "whatsapp"));
  const nomeContato = texto(formData, "contatoNome");

  const cliente = await db.cliente.create({
    data: {
      organizacaoId: org.id,
      tipo: formData.get("tipo") === "PF" ? "PF" : "PJ",
      nome,
      nomeFantasia: texto(formData, "nomeFantasia"),
      documento: texto(formData, "documento"),
      telefone: texto(formData, "telefone"),
      whatsapp,
      email: texto(formData, "email"),
      cidade: texto(formData, "cidade"),
      uf: texto(formData, "uf")?.toUpperCase(),
      segmento: texto(formData, "segmento"),
      origem: texto(formData, "origem"),
      observacoes: texto(formData, "observacoes"),
      contatos: nomeContato
        ? {
            create: {
              organizacaoId: org.id,
              nome: nomeContato,
              cargo: texto(formData, "contatoCargo"),
              whatsapp,
              principal: true,
            },
          }
        : undefined,
    },
  });

  redirect(`/clientes/${cliente.id}`);
}

const TIPOS: TipoAtividade[] = ["NOTA", "LIGACAO", "WHATSAPP", "EMAIL", "REUNIAO", "VISITA", "TAREFA"];

export async function adicionarAtividade(clienteId: string, formData: FormData) {
  const org = await getOrganizacaoAtual();
  const cliente = await db.cliente.findFirst({ where: { id: clienteId, organizacaoId: org.id } });
  if (!cliente) throw new Error("Cliente não encontrado.");

  const descricao = texto(formData, "descricao");
  if (!descricao) return;
  const tipo = TIPOS.find((t) => t === formData.get("tipo")) ?? "NOTA";
  const quando = texto(formData, "agendadaPara");

  await db.atividade.create({
    data: {
      organizacaoId: org.id,
      clienteId,
      tipo,
      descricao,
      agendadaPara: quando ? new Date(`${quando}T09:00:00-03:00`) : null,
    },
  });
  refresh();
}

export async function alternarConclusao(atividadeId: string) {
  const org = await getOrganizacaoAtual();
  const atividade = await db.atividade.findFirst({ where: { id: atividadeId, organizacaoId: org.id } });
  if (!atividade) throw new Error("Atividade não encontrada.");
  await db.atividade.update({ where: { id: atividadeId }, data: { concluida: !atividade.concluida } });
  refresh();
}
