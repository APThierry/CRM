// Faixa no topo das telas internas enquanto a empresa está em teste (Fase F2).
import Link from "next/link";
import { connection } from "next/server";
import { diasRestantes } from "@/lib/empresas/situacao";
import { lerSessao } from "@/lib/sessao";

export async function AvisoTeste() {
  await connection();
  const sessao = await lerSessao();
  const org = sessao?.usuario.organizacao;
  if (!org || org.situacao !== "EM_TESTE" || !org.testeAte) return null;
  const dias = diasRestantes(org.testeAte);
  const fim = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(org.testeAte);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 print:hidden">
      <span>
        <strong>Período de teste:</strong> {dias === 0 ? "termina hoje" : dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`} (até {fim}).
      </span>
      <Link href="/primeiros-passos" className="underline">Primeiros passos</Link>
    </div>
  );
}
