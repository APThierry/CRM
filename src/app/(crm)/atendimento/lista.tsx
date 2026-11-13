// Coluna da esquerda: abas, busca e lista de conversas.
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import type { UsuarioAtual } from "@/lib/auth";
import { conversasVisiveis, veTodasConversas } from "@/lib/atendimento";
import { db } from "@/lib/db";
import { telefone } from "@/lib/formatar";
import { NovaConversa } from "./interativos";

export const ABAS = {
  abertas: "Abertas",
  minhas: "Minhas",
  fila: "Fila",
  finalizadas: "Finalizadas",
} as const;
export type Aba = keyof typeof ABAS;

export type Filtros = { aba: Aba; q?: string; etiqueta?: string };

function filtroDaAba(eu: UsuarioAtual, aba: Aba): Prisma.ConversaWhereInput {
  switch (aba) {
    case "minhas":
      return { status: "ABERTA", atendenteId: eu.id };
    case "fila":
      return { status: "ABERTA", atendenteId: null };
    case "finalizadas":
      return { status: "FINALIZADA" };
    default:
      return { status: "ABERTA" };
  }
}

/** Monta o endereço mantendo os filtros atuais. */
export function linkAtendimento(filtros: Filtros, mudancas: Partial<Filtros & { c: string | null }>) {
  const p = new URLSearchParams();
  const tudo = { ...filtros, ...mudancas };
  if (tudo.aba && tudo.aba !== "abertas") p.set("aba", tudo.aba);
  if (tudo.q) p.set("q", tudo.q);
  if (tudo.etiqueta) p.set("etiqueta", tudo.etiqueta);
  if (tudo.c) p.set("c", tudo.c);
  const s = p.toString();
  return `/atendimento${s ? `?${s}` : ""}`;
}

/** Nome para mostrar: contato > cliente > perfil do WhatsApp > número. */
export function nomeDaConversa(c: {
  nome: string | null;
  telefone: string;
  cliente?: { nome: string } | null;
  contato?: { nome: string } | null;
}) {
  if (c.contato && c.cliente && c.contato.nome !== c.cliente.nome) return `${c.contato.nome} · ${c.cliente.nome}`;
  return c.cliente?.nome ?? c.nome ?? telefone(c.telefone);
}

const horaOuData = (d: Date) => {
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const dia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return dia === hoje
    ? d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    : dia.slice(0, 5);
};

export async function ListaConversas({ eu, filtros, selecionada }: { eu: UsuarioAtual; filtros: Filtros; selecionada?: string }) {
  const visiveis = conversasVisiveis(eu);
  const busca = filtros.q?.trim();
  const digitos = busca?.replace(/\D/g, "");

  const where: Prisma.ConversaWhereInput = {
    AND: [
      visiveis,
      filtroDaAba(eu, filtros.aba),
      filtros.etiqueta ? { etiquetas: { some: { id: filtros.etiqueta } } } : {},
      busca
        ? {
            OR: [
              { nome: { contains: busca, mode: "insensitive" } },
              { cliente: { nome: { contains: busca, mode: "insensitive" } } },
              { contato: { nome: { contains: busca, mode: "insensitive" } } },
              ...(digitos && digitos.length >= 3 ? [{ telefone: { contains: digitos } }] : []),
            ],
          }
        : {},
    ],
  };

  const [conversas, contagens, etiquetas] = await Promise.all([
    db.conversa.findMany({
      where,
      orderBy: { ultimaEm: "desc" },
      take: 100,
      include: {
        cliente: { select: { nome: true } },
        contato: { select: { nome: true } },
        atendente: { select: { id: true, nome: true } },
        etiquetas: { select: { id: true, nome: true, cor: true } },
      },
    }),
    Promise.all(
      (Object.keys(ABAS) as Aba[]).map(async (aba) => {
        const w = { AND: [visiveis, filtroDaAba(eu, aba)] };
        const [total, naoLidas] = await Promise.all([
          aba === "finalizadas" ? Promise.resolve(0) : db.conversa.count({ where: w }),
          db.conversa.count({ where: { AND: [w, { naoLidas: { gt: 0 } }] } }),
        ]);
        return [aba, { total, naoLidas }] as const;
      }),
    ).then(Object.fromEntries) as Promise<Record<Aba, { total: number; naoLidas: number }>>,
    db.etiqueta.findMany({ where: { organizacaoId: eu.organizacao.id }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Atendimento</h1>
          <Link href="/atendimento/respostas" className="text-xs text-slate-500 underline hover:text-slate-800">
            Respostas e etiquetas
          </Link>
        </div>
        <nav className="flex gap-1 text-xs" aria-label="Abas">
          {(Object.keys(ABAS) as Aba[]).map((aba) => {
            const ativa = filtros.aba === aba;
            const n = contagens[aba];
            return (
              <Link
                key={aba}
                href={linkAtendimento(filtros, { aba, c: selecionada ?? null })}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${ativa ? "bg-marca-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {ABAS[aba]}
                {aba !== "finalizadas" && n.total > 0 && <span className="opacity-70">{n.total}</span>}
                {n.naoLidas > 0 && <span className="rounded-full bg-green-500 px-1.5 text-[10px] font-bold text-white">{n.naoLidas}</span>}
              </Link>
            );
          })}
        </nav>
        <form action="/atendimento" className="flex gap-1">
          {filtros.aba !== "abertas" && <input type="hidden" name="aba" value={filtros.aba} />}
          <input name="q" defaultValue={filtros.q} placeholder="Buscar nome ou número" aria-label="Buscar conversa" className="campo py-1.5 text-sm" />
          {etiquetas.length > 0 && (
            <select name="etiqueta" defaultValue={filtros.etiqueta ?? ""} aria-label="Filtrar por etiqueta" className="campo w-28 py-1.5 text-xs">
              <option value="">Etiqueta</option>
              {etiquetas.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
          )}
          <button className="botao-secundario px-2 py-1.5 text-xs">Filtrar</button>
        </form>
      </div>

      <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        {conversas.length === 0 && (
          <li className="p-6 text-center text-sm text-slate-500">
            {filtros.aba === "minhas" ? "Nenhuma conversa com você. Veja a Fila." : "Nenhuma conversa aqui."}
          </li>
        )}
        {conversas.map((c) => (
          <li key={c.id}>
            <Link
              href={linkAtendimento(filtros, { c: c.id })}
              className={`block px-3 py-2.5 hover:bg-slate-50 ${c.id === selecionada ? "bg-marca-50" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className={`truncate text-sm ${c.naoLidas > 0 ? "font-semibold" : "font-medium"}`}>{nomeDaConversa(c)}</span>
                <span className={`shrink-0 text-[11px] ${c.naoLidas > 0 ? "font-semibold text-green-600" : "text-slate-400"}`}>{horaOuData(c.ultimaEm)}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="line-clamp-1 text-xs text-slate-500">
                  {c.ultimaDirecao === "SAIDA" && "Você: "}
                  {c.ultimaTexto}
                </span>
                {c.naoLidas > 0 && (
                  <span className="shrink-0 rounded-full bg-green-500 px-1.5 text-[11px] font-bold text-white">{c.naoLidas}</span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {!c.cliente && <span className="text-[10px] text-amber-700">não cadastrado</span>}
                {c.atendente
                  ? veTodasConversas(eu.papel) && c.atendente.id !== eu.id && <span className="text-[10px] text-slate-400">👤 {c.atendente.nome.split(" ")[0]}</span>
                  : <span className="text-[10px] font-medium text-marca-700">na fila</span>}
                {c.etiquetas.map((e) => (
                  <span key={e.id} className="rounded-full px-1.5 text-[10px] font-medium" style={{ backgroundColor: `${e.cor}1a`, color: e.cor }}>
                    {e.nome}
                  </span>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <NovaConversa />
    </div>
  );
}
