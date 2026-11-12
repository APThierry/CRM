// Tela do WhatsApp: conexão do número e últimas conversas.
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando, Vazio } from "@/components/ui";
import { db } from "@/lib/db";
import { dataHora, telefone } from "@/lib/formatar";
import { getOrganizacaoAtual } from "@/lib/org";
import { estadoConexao } from "@/lib/whatsapp/evolution";
import { Conexao } from "./conexao";

export const metadata: Metadata = { title: "WhatsApp" };

export default function PaginaWhatsapp() {
  return (
    <>
      <Cabecalho titulo="WhatsApp" subtitulo="Conexão do número da empresa e conversas recentes" />
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </>
  );
}

async function Conteudo() {
  await connection();
  const org = await getOrganizacaoAtual();
  const [estado, mensagens] = await Promise.all([
    estadoConexao(),
    db.mensagemWhatsapp.findMany({
      where: { organizacaoId: org.id },
      include: { cliente: { select: { id: true, nome: true } } },
      orderBy: { criadoEm: "desc" },
      take: 300,
    }),
  ]);

  // Uma linha por telefone, com a última mensagem.
  const conversas = new Map<string, (typeof mensagens)[number] & { naoRespondida: boolean }>();
  for (const m of mensagens) {
    if (!conversas.has(m.telefone)) conversas.set(m.telefone, { ...m, naoRespondida: m.direcao === "ENTRADA" });
  }

  return (
    <div className="space-y-6">
      <Conexao inicial={estado} />

      <section className="cartao">
        <h2 className="p-4 pb-2 font-semibold">Conversas recentes</h2>
        {conversas.size === 0 ? (
          <div className="p-4 pt-0"><Vazio>Nenhuma mensagem ainda. As mensagens recebidas aparecem aqui.</Vazio></div>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {[...conversas.values()].map((c) => (
              <li key={c.telefone} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  {c.cliente ? (
                    <Link href={`/clientes/${c.cliente.id}#whatsapp`} className="font-medium hover:underline">{c.cliente.nome}</Link>
                  ) : (
                    <span className="font-medium">
                      {c.direcao === "ENTRADA" && c.status ? `${c.status} · ` : ""}
                      {telefone(c.telefone)}{" "}
                      <span className="text-xs font-normal text-amber-700">(não cadastrado)</span>
                    </span>
                  )}
                  <div className="truncate text-slate-500">
                    {c.direcao === "SAIDA" ? "Você: " : ""}
                    {c.conteudo}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-slate-500">
                  {dataHora(c.criadoEm)}
                  {c.naoRespondida && <div className="mt-1 font-medium text-green-700">aguardando resposta</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
