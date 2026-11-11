import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando } from "@/components/ui";
import { db } from "@/lib/db";
import { getOrganizacaoAtual } from "@/lib/org";
import { criarNegocio } from "./actions";
import { Kanban } from "./kanban";

export const metadata: Metadata = { title: "Funil de vendas" };

export default function PaginaFunil() {
  return (
    <>
      <Cabecalho titulo="Funil de vendas" subtitulo="Arraste os cartões entre as colunas para mudar a etapa" />
      <Suspense fallback={<Carregando />}>
        <Funil />
      </Suspense>
    </>
  );
}

async function Funil() {
  await connection();
  const org = await getOrganizacaoAtual();
  const [etapas, negocios, clientes, servicos] = await Promise.all([
    db.etapaFunil.findMany({ where: { organizacaoId: org.id }, orderBy: { ordem: "asc" } }),
    db.negocio.findMany({
      where: { organizacaoId: org.id },
      include: { cliente: { select: { id: true, nome: true } }, servico: { select: { nome: true } } },
      orderBy: { atualizadoEm: "desc" },
    }),
    db.cliente.findMany({ where: { organizacaoId: org.id }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    db.servico.findMany({ where: { organizacaoId: org.id, ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <details className="cartao max-w-4xl p-4">
        <summary className="cursor-pointer text-sm font-medium text-marca-700">+ Novo negócio</summary>
        <form action={criarNegocio} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="rotulo" htmlFor="clienteId">Cliente *</label>
            <select id="clienteId" name="clienteId" required className="campo" defaultValue="">
              <option value="" disabled>Selecione…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="servicoId">Curso</label>
            <select id="servicoId" name="servicoId" className="campo" defaultValue="">
              <option value="">—</option>
              {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="titulo">Título (opcional)</label>
            <input id="titulo" name="titulo" placeholder="Gerado a partir do curso e cliente" className="campo" />
          </div>
          <div>
            <label className="rotulo" htmlFor="quantidadeAlunos">Nº de alunos</label>
            <input id="quantidadeAlunos" name="quantidadeAlunos" type="number" min={1} className="campo" />
          </div>
          <div>
            <label className="rotulo" htmlFor="valor">Valor (R$)</label>
            <input id="valor" name="valor" inputMode="decimal" placeholder="0,00" className="campo" />
          </div>
          <div className="flex items-end">
            <button className="botao w-full">Criar negócio</button>
          </div>
        </form>
      </details>

      <Kanban
        etapas={etapas.map(({ id, nome, cor, tipo }) => ({ id, nome, cor, tipo }))}
        // O tipo Decimal do banco não pode ir para o navegador, então convertemos para número.
        negocios={negocios.map((n) => ({
          id: n.id,
          titulo: n.titulo,
          etapaId: n.etapaId,
          valor: Number(n.valor),
          quantidadeAlunos: n.quantidadeAlunos,
          cliente: n.cliente,
          servico: n.servico?.nome ?? null,
        }))}
      />
    </div>
  );
}
