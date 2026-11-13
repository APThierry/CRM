"use client";
// Quadro Kanban. Roda no navegador (Client Component) porque precisa de
// arrastar e soltar. Ao soltar um cartão, chama a Server Action `moverNegocio`.
// Em telas de toque (celular, tablet) o arrastar não funciona: cada cartão tem
// um seletor "Mover para…" que faz a mesma coisa.
import Link from "next/link";
import { useOptimistic, useTransition, useState } from "react";
import { moverNegocio } from "./actions";

export type EtapaKanban = { id: string; nome: string; cor: string; tipo: string };
export type NegocioKanban = {
  id: string;
  titulo: string;
  etapaId: string;
  valor: number;
  quantidadeAlunos: number | null;
  cliente: { id: string; nome: string };
  servico: string | null;
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function Kanban({ etapas, negocios }: { etapas: EtapaKanban[]; negocios: NegocioKanban[] }) {
  // useOptimistic: o cartão muda de coluna na hora, antes do servidor responder.
  const [lista, moverOtimista] = useOptimistic(negocios, (atual, { id, etapaId }: { id: string; etapaId: string }) =>
    atual.map((n) => (n.id === id ? { ...n, etapaId } : n)),
  );
  const [, iniciar] = useTransition();
  const [colunaSobre, setColunaSobre] = useState<string | null>(null);

  function mover(id: string, etapaId: string) {
    const negocio = lista.find((n) => n.id === id);
    if (!negocio || negocio.etapaId === etapaId) return;
    iniciar(async () => {
      moverOtimista({ id, etapaId });
      await moverNegocio(id, etapaId);
    });
  }

  function soltar(etapaId: string, e: React.DragEvent) {
    e.preventDefault();
    setColunaSobre(null);
    mover(e.dataTransfer.getData("text/plain"), etapaId);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {etapas.map((etapa) => {
        const cartoes = lista.filter((n) => n.etapaId === etapa.id);
        const total = cartoes.reduce((s, n) => s + n.valor, 0);
        return (
          <div
            key={etapa.id}
            onDragOver={(e) => {
              e.preventDefault();
              setColunaSobre(etapa.id);
            }}
            onDragLeave={() => setColunaSobre(null)}
            onDrop={(e) => soltar(etapa.id, e)}
            className={`flex w-72 shrink-0 flex-col rounded-lg bg-slate-100 p-2 transition ${
              colunaSobre === etapa.id ? "ring-2 ring-marca-500" : ""
            }`}
          >
            <div className="mb-2 px-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: etapa.cor }} />
                {etapa.nome}
                <span className="ml-auto text-xs font-normal text-slate-500">{cartoes.length}</span>
              </div>
              <div className="mt-0.5 pl-4.5 text-xs text-slate-500">{moeda.format(total)}</div>
            </div>
            <div className="flex min-h-24 flex-col gap-2">
              {cartoes.map((n) => (
                <div
                  key={n.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", n.id)}
                  className="cursor-grab rounded-md border border-slate-200 bg-white p-3 text-sm shadow-sm active:cursor-grabbing"
                >
                  <div className="font-medium leading-snug">{n.titulo}</div>
                  <Link href={`/clientes/${n.cliente.id}`} className="mt-1 block text-xs text-slate-500 hover:underline">
                    {n.cliente.nome}
                  </Link>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{moeda.format(n.valor)}</span>
                    {n.quantidadeAlunos && <span className="text-slate-500">{n.quantidadeAlunos} alunos</span>}
                  </div>
                  <select
                    value={n.etapaId}
                    onChange={(e) => mover(n.id, e.target.value)}
                    aria-label={`Mover ${n.titulo} para outra etapa`}
                    className="campo mt-2 py-1 text-xs lg:hidden"
                  >
                    {etapas.map((et) => (
                      <option key={et.id} value={et.id}>
                        {et.id === n.etapaId ? `Etapa: ${et.nome}` : `Mover para ${et.nome}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
