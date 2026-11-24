// Primeiros passos de uma empresa nova (Fase F2): uma lista que se marca
// sozinha conforme a empresa vai configurando o CRM.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando } from "@/components/ui";
import { getUsuarioAtual } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Primeiros passos" };

export default function PaginaPrimeirosPassos() {
  return (
    <>
      <Cabecalho titulo="Primeiros passos" subtitulo="O que configurar para começar a atender pelo CRM" />
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </>
  );
}

async function Conteudo() {
  await connection();
  const eu = await getUsuarioAtual();
  const organizacaoId = eu.organizacao.id;
  const [zap, automacao, usuarios, clientes, conversas, liberacao] = await Promise.all([
    db.configuracaoWhatsapp.findUnique({ where: { organizacaoId }, select: { ativo: true } }),
    db.configuracaoAutomacao.findUnique({ where: { organizacaoId }, select: { horarioAtivo: true, botAtivo: true } }),
    db.usuario.count({ where: { organizacaoId, ativo: true } }),
    db.cliente.count({ where: { organizacaoId } }),
    db.conversa.count({ where: { organizacaoId } }),
    db.organizacao.findUniqueOrThrow({ where: { id: organizacaoId }, select: { campanhasLiberadas: true } }),
  ]);

  const passos = [
    {
      feito: Boolean(zap?.ativo),
      titulo: "Conectar o WhatsApp da empresa",
      texto: "Leia o QR Code com o celular do número que atende os clientes. As conversas passam a aparecer na Central de atendimento.",
      href: "/whatsapp",
      botao: "Conectar",
    },
    {
      feito: Boolean(automacao?.horarioAtivo || automacao?.botAtivo),
      titulo: "Definir o horário de atendimento e o menu automático",
      texto: "Fora do horário, o cliente recebe um aviso. O menu (chatbot) já separa os assuntos antes de um atendente responder.",
      href: "/automacao",
      botao: "Configurar",
    },
    {
      feito: usuarios > 1,
      titulo: "Cadastrar a equipe",
      texto: "Cada atendente com o próprio login. Gestores veem todas as conversas e relatórios; vendedores, as deles.",
      href: "/usuarios",
      botao: "Cadastrar",
    },
    {
      feito: clientes > 0,
      titulo: "Cadastrar o primeiro cliente",
      texto: "Ou cadastre direto de uma conversa do WhatsApp, pelo botão na Central de atendimento.",
      href: "/clientes/novo",
      botao: "Cadastrar",
    },
    {
      feito: conversas > 0,
      titulo: "Receber a primeira mensagem",
      texto: "Peça para alguém mandar uma mensagem para o número conectado e responda pela Central de atendimento.",
      href: "/atendimento",
      botao: "Abrir",
    },
  ];
  const feitos = passos.filter((p) => p.feito).length;

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-slate-600">
        {feitos === passos.length ? "Tudo pronto! 🎉" : `${feitos} de ${passos.length} feitos.`} A lista se marca sozinha conforme você configura.
      </p>
      <ol className="space-y-3">
        {passos.map((p, i) => (
          <li key={p.titulo} className="cartao flex flex-wrap items-start gap-3 p-4">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${p.feito ? "bg-green-600 text-white" : "bg-slate-100 text-slate-500"}`}
              aria-label={p.feito ? "feito" : "a fazer"}
            >
              {p.feito ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`font-medium ${p.feito ? "text-slate-500 line-through" : ""}`}>{p.titulo}</div>
              <p className="text-sm text-slate-500">{p.texto}</p>
            </div>
            {!p.feito && (
              <Link href={p.href} className="botao-secundario">
                {p.botao}
              </Link>
            )}
          </li>
        ))}
      </ol>
      {!liberacao.campanhasLiberadas && (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <strong>Campanhas (envio em massa):</strong> ficam disponíveis depois que o suporte aprovar a conta. Até lá, dá para montar e revisar.
        </p>
      )}
    </div>
  );
}
