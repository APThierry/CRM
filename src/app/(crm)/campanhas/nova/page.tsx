// Nova campanha: 1) escolher o público (o filtro vai na URL e mostra quem recebe),
// 2) escrever a mensagem e criar o rascunho.
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando } from "@/components/ui";
import { exigirPapel } from "@/lib/auth";
import { montarPublico, type FiltroPublico } from "@/lib/campanhas/publico";
import { estimarDuracao } from "@/lib/campanhas/ritmo";
import { db } from "@/lib/db";
import { telefone } from "@/lib/formatar";
import { FormNovaCampanha } from "../formularios";

export const metadata: Metadata = { title: "Nova campanha" };

export default function PaginaNovaCampanha({ searchParams }: PageProps<"/campanhas/nova">) {
  return (
    <>
      <Cabecalho titulo="Nova campanha" acoes={<Link href="/campanhas" className="botao-secundario">Voltar</Link>} />
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/campanhas/nova">["searchParams"] }) {
  await connection();
  const eu = await exigirPapel("ADMIN", "GESTOR");
  const org = eu.organizacao.id;
  const sp = await searchParams;
  const texto = (n: string) => (typeof sp[n] === "string" ? (sp[n] as string).trim() : "");
  const certificado = texto("certificado");
  const filtro: FiltroPublico = {
    segmento: texto("segmento") || undefined,
    cidade: texto("cidade") || undefined,
    etiquetaId: texto("etiquetaId") || undefined,
    servicoId: texto("servicoId") || undefined,
    certificado: certificado === "vencendo" || certificado === "vencido" ? certificado : "",
  };

  const [segmentos, cidades, etiquetas, cursos, publico] = await Promise.all([
    db.cliente.findMany({ where: { organizacaoId: org, segmento: { not: null } }, distinct: ["segmento"], select: { segmento: true }, orderBy: { segmento: "asc" } }),
    db.cliente.findMany({ where: { organizacaoId: org, cidade: { not: null } }, distinct: ["cidade"], select: { cidade: true }, orderBy: { cidade: "asc" } }),
    db.etiqueta.findMany({ where: { organizacaoId: org }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    db.servico.findMany({ where: { organizacaoId: org }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    montarPublico(org, filtro),
  ]);
  const recebem = publico.filter((p) => !p.fora);
  const fora = publico.filter((p) => p.fora);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <section className="cartao p-4">
          <h2 className="mb-3 font-semibold">1. Público</h2>
          {/* GET: o filtro vai para a URL e a lista ao lado atualiza. */}
          <form className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="segmento">Segmento</label>
              <select id="segmento" name="segmento" defaultValue={filtro.segmento ?? ""} className="campo">
                <option value="">Todos</option>
                {segmentos.map((s) => <option key={s.segmento}>{s.segmento}</option>)}
              </select>
            </div>
            <div>
              <label className="rotulo" htmlFor="cidade">Cidade</label>
              <select id="cidade" name="cidade" defaultValue={filtro.cidade ?? ""} className="campo">
                <option value="">Todas</option>
                {cidades.map((c) => <option key={c.cidade}>{c.cidade}</option>)}
              </select>
            </div>
            <div>
              <label className="rotulo" htmlFor="etiquetaId">Etiqueta na conversa</label>
              <select id="etiquetaId" name="etiquetaId" defaultValue={filtro.etiquetaId ?? ""} className="campo">
                <option value="">Qualquer</option>
                {etiquetas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="rotulo" htmlFor="servicoId">Já fez o curso</label>
              <select id="servicoId" name="servicoId" defaultValue={filtro.servicoId ?? ""} className="campo">
                <option value="">Qualquer</option>
                {cursos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="certificado">Certificados</label>
              <select id="certificado" name="certificado" defaultValue={filtro.certificado ?? ""} className="campo">
                <option value="">Qualquer situação</option>
                <option value="vencendo">Vencendo nos próximos 60 dias</option>
                <option value="vencido">Já vencidos</option>
              </select>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button className="botao-secundario">Ver público</button>
              <Link href="/campanhas/nova" className="botao-secundario">Limpar</Link>
            </div>
          </form>
        </section>

        <section className="cartao p-4">
          <h2 className="mb-3 font-semibold">2. Mensagem</h2>
          <FormNovaCampanha filtro={filtro} quantidade={recebem.length} />
        </section>
      </div>

      <section className="cartao p-4">
        <h2 className="font-semibold">Quem vai receber: {recebem.length}</h2>
        <p className="mb-3 text-xs text-slate-500">Tempo estimado de envio: {estimarDuracao(recebem.length)}</p>
        <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto text-sm">
          {recebem.map((p) => (
            <li key={p.clienteId} className="flex justify-between gap-2 py-1.5">
              <span>
                {p.cliente}
                {p.nome !== p.cliente && <span className="text-xs text-slate-500"> · {p.nome}</span>}
              </span>
              <span className="whitespace-nowrap text-xs text-slate-500">{telefone(p.telefone)}</span>
            </li>
          ))}
        </ul>
        {fora.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-slate-500">{fora.length} cliente(s) fora desta campanha</summary>
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              {fora.map((p) => <li key={p.clienteId}>{p.cliente}: {p.fora}</li>)}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
