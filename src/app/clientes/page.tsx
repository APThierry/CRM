import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando, Vazio } from "@/components/ui";
import { db } from "@/lib/db";
import { linkWhatsapp, telefone } from "@/lib/formatar";
import { getOrganizacaoAtual } from "@/lib/org";

export const metadata: Metadata = { title: "Clientes" };

export default function PaginaClientes({ searchParams }: PageProps<"/clientes">) {
  return (
    <>
      <Cabecalho
        titulo="Clientes"
        subtitulo="Empresas e pessoas que compram os treinamentos"
        acoes={<Link href="/clientes/novo" className="botao">+ Novo cliente</Link>}
      />
      <Suspense fallback={<Carregando />}>
        <ListaClientes searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ListaClientes({ searchParams }: { searchParams: PageProps<"/clientes">["searchParams"] }) {
  await connection();
  const { q } = await searchParams;
  const busca = typeof q === "string" ? q.trim() : "";
  const org = await getOrganizacaoAtual();

  const clientes = await db.cliente.findMany({
    where: {
      organizacaoId: org.id,
      ...(busca && {
        OR: [
          { nome: { contains: busca, mode: "insensitive" } },
          { nomeFantasia: { contains: busca, mode: "insensitive" } },
          { cidade: { contains: busca, mode: "insensitive" } },
          { segmento: { contains: busca, mode: "insensitive" } },
          { contatos: { some: { nome: { contains: busca, mode: "insensitive" } } } },
        ],
      }),
    },
    include: {
      contatos: { where: { principal: true }, take: 1 },
      _count: { select: { negocios: true } },
    },
    orderBy: { nome: "asc" },
  });

  return (
    <div className="space-y-4">
      {/* Formulário GET: a busca vai para a URL (?q=...), então dá para compartilhar o link. */}
      <form className="flex max-w-md gap-2">
        <input name="q" defaultValue={busca} placeholder="Buscar por nome, cidade, segmento ou contato" className="campo" />
        <button className="botao-secundario">Buscar</button>
      </form>

      {clientes.length === 0 ? (
        <Vazio>{busca ? `Nenhum cliente encontrado para "${busca}".` : "Nenhum cliente cadastrado ainda."}</Vazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3">Cidade</th>
                <th className="px-4 py-3">Segmento</th>
                <th className="px-4 py-3 text-center">Negócios</th>
                <th className="px-4 py-3">WhatsApp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clientes.map((c) => {
                const contato = c.contatos[0];
                const zap = linkWhatsapp(c.whatsapp ?? contato?.whatsapp);
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/clientes/${c.id}`} className="font-medium text-slate-900 hover:underline">{c.nome}</Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {contato ? (
                        <>
                          {contato.nome}
                          {contato.cargo && <div className="text-xs text-slate-400">{contato.cargo}</div>}
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.cidade ? `${c.cidade}/${c.uf ?? ""}` : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{c.segmento ?? "—"}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{c._count.negocios}</td>
                    <td className="px-4 py-3">
                      {zap ? (
                        <a href={zap} target="_blank" rel="noreferrer" className="text-green-700 hover:underline">
                          {telefone(c.whatsapp ?? contato?.whatsapp)}
                        </a>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
