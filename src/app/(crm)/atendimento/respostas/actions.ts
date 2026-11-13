"use server";
// Respostas rápidas e etiquetas da Central de atendimento.
// - Respostas "da equipe" e etiquetas: só administrador e gestor criam ou apagam.
// - Respostas "só minhas": cada pessoa cuida das suas.
import { refresh } from "next/cache";
import { getUsuarioAtual } from "@/lib/auth";
import { veTodasConversas } from "@/lib/atendimento";
import { db } from "@/lib/db";

export type Resultado = { erro?: string; ok?: string } | null;
const campo = (f: FormData, nome: string) => String(f.get(nome) ?? "").trim();

export async function criarResposta(_estado: Resultado, formData: FormData): Promise<Resultado> {
  const eu = await getUsuarioAtual();
  const atalho = campo(formData, "atalho").replace(/^\/+/, "").toLowerCase().replace(/\s+/g, "-");
  const texto = campo(formData, "texto");
  const daEquipe = formData.get("daEquipe") === "on";
  if (!/^[a-z0-9à-ú_-]{1,30}$/.test(atalho)) return { erro: "Atalho: use só letras, números e hífen (até 30)." };
  if (!texto) return { erro: "Escreva o texto da resposta." };
  if (daEquipe && !veTodasConversas(eu.papel)) return { erro: "Só administrador ou gestor cria respostas da equipe." };

  const usuarioId = daEquipe ? null : eu.id;
  const repetida = await db.respostaRapida.findFirst({
    where: { organizacaoId: eu.organizacao.id, atalho, OR: [{ usuarioId: null }, { usuarioId: eu.id }] },
  });
  if (repetida) return { erro: `Já existe uma resposta /${atalho}.` };

  await db.respostaRapida.create({ data: { organizacaoId: eu.organizacao.id, usuarioId, atalho, texto } });
  refresh();
  return { ok: `Resposta /${atalho} criada.` };
}

export async function apagarResposta(id: string) {
  const eu = await getUsuarioAtual();
  const r = await db.respostaRapida.findFirst({ where: { id, organizacaoId: eu.organizacao.id } });
  if (!r) return;
  const pode = r.usuarioId ? r.usuarioId === eu.id : veTodasConversas(eu.papel);
  if (!pode) throw new Error("Sem permissão para apagar esta resposta.");
  await db.respostaRapida.delete({ where: { id } });
  refresh();
}

export async function criarEtiqueta(_estado: Resultado, formData: FormData): Promise<Resultado> {
  const eu = await getUsuarioAtual();
  if (!veTodasConversas(eu.papel)) return { erro: "Só administrador ou gestor cria etiquetas." };
  const nome = campo(formData, "nome").slice(0, 30);
  const cor = /^#[0-9a-f]{6}$/i.test(campo(formData, "cor")) ? campo(formData, "cor") : "#64748b";
  if (!nome) return { erro: "Informe o nome da etiqueta." };
  const existe = await db.etiqueta.findFirst({ where: { organizacaoId: eu.organizacao.id, nome: { equals: nome, mode: "insensitive" } } });
  if (existe) return { erro: "Já existe uma etiqueta com esse nome." };
  await db.etiqueta.create({ data: { organizacaoId: eu.organizacao.id, nome, cor } });
  refresh();
  return { ok: `Etiqueta "${nome}" criada.` };
}

export async function apagarEtiqueta(id: string) {
  const eu = await getUsuarioAtual();
  if (!veTodasConversas(eu.papel)) throw new Error("Só administrador ou gestor apaga etiquetas.");
  await db.etiqueta.deleteMany({ where: { id, organizacaoId: eu.organizacao.id } });
  refresh();
}
