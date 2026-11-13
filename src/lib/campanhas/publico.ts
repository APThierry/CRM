import "server-only";
// Quem vai receber uma campanha: clientes cadastrados com WhatsApp, filtrados
// por segmento, cidade, etiqueta, curso ou situação dos certificados.
// Uma mensagem por cliente (pelo contato principal). Descadastrados ficam de fora.
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { chaveTelefone, normalizarWhatsapp } from "@/lib/formatar";

export type FiltroPublico = {
  segmento?: string;
  cidade?: string;
  etiquetaId?: string;
  servicoId?: string;
  /** "vencendo" = vence nos próximos 60 dias; "vencido" = já venceu. */
  certificado?: "" | "vencendo" | "vencido";
  /** Só estes clientes (usado pela reciclagem; não vem do formulário). */
  clienteIds?: string[];
};

export type Candidato = {
  clienteId: string;
  contatoId: string | null;
  nome: string;
  cliente: string;
  telefone: string | null;
  chave: string | null;
  /** Por que não vai receber (sem WhatsApp, descadastrado, número repetido). */
  fora?: string;
};

const DIA = 86_400_000;

export function lerFiltro(f: FormData): FiltroPublico {
  const v = (n: string) => String(f.get(n) ?? "").trim();
  const cert = v("certificado");
  return {
    segmento: v("segmento") || undefined,
    cidade: v("cidade") || undefined,
    etiquetaId: v("etiquetaId") || undefined,
    servicoId: v("servicoId") || undefined,
    certificado: cert === "vencendo" || cert === "vencido" ? cert : "",
  };
}

function onde(organizacaoId: string, f: FiltroPublico): Prisma.ClienteWhereInput {
  const agora = new Date();
  const validade =
    f.certificado === "vencendo"
      ? { gte: agora, lte: new Date(agora.getTime() + 60 * DIA) }
      : f.certificado === "vencido"
        ? { lt: agora }
        : undefined;
  const matricula: Prisma.MatriculaWhereInput = {
    ...(f.servicoId ? { turma: { servicoId: f.servicoId } } : {}),
    ...(validade ? { validadeAte: validade, aprovado: true } : {}),
  };
  return {
    organizacaoId,
    ...(f.clienteIds ? { id: { in: f.clienteIds } } : {}),
    ...(f.segmento ? { segmento: f.segmento } : {}),
    ...(f.cidade ? { cidade: { equals: f.cidade, mode: "insensitive" } } : {}),
    ...(f.etiquetaId ? { conversas: { some: { etiquetas: { some: { id: f.etiquetaId } } } } } : {}),
    ...(f.servicoId || validade ? { participantes: { some: { matriculas: { some: matricula } } } } : {}),
  };
}

export async function chavesDescadastradas(organizacaoId: string) {
  const lista = await db.descadastro.findMany({ where: { organizacaoId }, select: { chave: true } });
  return new Set(lista.map((d) => d.chave));
}

/** Lista todos os clientes do filtro e marca quem fica de fora (e por quê). */
export async function montarPublico(organizacaoId: string, filtro: FiltroPublico): Promise<Candidato[]> {
  const [clientes, descadastrados] = await Promise.all([
    db.cliente.findMany({
      where: onde(organizacaoId, filtro),
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        whatsapp: true,
        contatos: { orderBy: [{ principal: "desc" }, { criadoEm: "asc" }], select: { id: true, nome: true, whatsapp: true } },
      },
    }),
    chavesDescadastradas(organizacaoId),
  ]);

  const usadas = new Set<string>();
  return clientes.map((c) => {
    // Contato com WhatsApp (o principal primeiro); senão, o WhatsApp do próprio cliente.
    const contato = c.contatos.find((k) => chaveTelefone(k.whatsapp));
    const telefone = normalizarWhatsapp(contato?.whatsapp ?? c.whatsapp);
    const chave = chaveTelefone(telefone);
    const base = { clienteId: c.id, contatoId: contato?.id ?? null, nome: contato?.nome ?? c.nome, cliente: c.nome, telefone, chave };
    if (!chave) return { ...base, fora: "sem WhatsApp" };
    if (descadastrados.has(chave)) return { ...base, fora: "pediu para sair" };
    if (usadas.has(chave)) return { ...base, fora: "mesmo número de outro cliente" };
    usadas.add(chave);
    return base;
  });
}
