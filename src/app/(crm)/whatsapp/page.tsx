// Tela do WhatsApp: conexão do número da empresa.
// As conversas ficam na Central de atendimento (/atendimento).
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando } from "@/components/ui";
import { db } from "@/lib/db";
import { getOrganizacaoAtual } from "@/lib/org";
import { estadoConexao } from "@/lib/whatsapp/evolution";
import { Conexao } from "./conexao";

export const metadata: Metadata = { title: "WhatsApp" };

export default function PaginaWhatsapp() {
  return (
    <>
      <Cabecalho titulo="WhatsApp" subtitulo="Conexão do número da empresa" />
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </>
  );
}

async function Conteudo() {
  await connection();
  const org = await getOrganizacaoAtual();
  const [estado, abertas, naoLidas, fila] = await Promise.all([
    estadoConexao(),
    db.conversa.count({ where: { organizacaoId: org.id, status: "ABERTA" } }),
    db.conversa.count({ where: { organizacaoId: org.id, naoLidas: { gt: 0 } } }),
    db.conversa.count({ where: { organizacaoId: org.id, status: "ABERTA", atendenteId: null } }),
  ]);

  return (
    <div className="space-y-6">
      <Conexao inicial={estado} />

      <section className="cartao flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h2 className="font-semibold">Conversas</h2>
          <p className="text-sm text-slate-500">
            {abertas} aberta(s) · {fila} na fila sem atendente · {naoLidas} com mensagens não lidas
          </p>
        </div>
        <Link href="/atendimento" className="botao">Abrir a Central de atendimento</Link>
      </section>
    </div>
  );
}
