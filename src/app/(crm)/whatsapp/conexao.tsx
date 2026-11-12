"use client";
// Cartão de conexão: mostra o estado e o QR Code, e se atualiza sozinho
// a cada 4 segundos enquanto o celular não estiver conectado.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { desconectarWhatsapp, iniciarConexao, reconfigurar, statusWhatsapp } from "./actions";

type Estado = Awaited<ReturnType<typeof statusWhatsapp>>;

const textos: Record<Estado["estado"], { titulo: string; cor: string }> = {
  open: { titulo: "Conectado", cor: "bg-green-500" },
  connecting: { titulo: "Aguardando leitura do QR Code", cor: "bg-amber-500" },
  close: { titulo: "Desconectado", cor: "bg-slate-400" },
  inexistente: { titulo: "Ainda não configurado", cor: "bg-slate-400" },
  erro: { titulo: "Evolution API fora do ar", cor: "bg-red-500" },
};

function formatarNumero(n?: string) {
  const d = (n ?? "").replace(/^55/, "");
  return d ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : "";
}

export function Conexao({ inicial }: { inicial: Estado }) {
  const router = useRouter();
  const [estado, setEstado] = useState(inicial);
  const [qr, setQr] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  // Enquanto não estiver conectado, consulta o estado de tempos em tempos.
  useEffect(() => {
    if (estado.estado === "open") return;
    const id = setInterval(async () => {
      const novo = await statusWhatsapp();
      setEstado(novo);
      if (novo.estado === "open") {
        setQr(null);
        router.refresh();
      }
    }, 4000);
    return () => clearInterval(id);
  }, [estado.estado, router]);

  const conectar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await iniciarConexao();
      if (r.erro) setErro(r.erro);
      else setQr(r.qr ?? null);
      setEstado(await statusWhatsapp());
    });

  const t = textos[estado.estado];

  return (
    <section className="cartao p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${t.cor}`} />
          <div>
            <div className="font-semibold">{t.titulo}</div>
            {estado.estado === "open" && (
              <div className="text-sm text-slate-500">
                {estado.nome} {formatarNumero(estado.numero)}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {estado.estado === "open" ? (
            <>
              <button
                className="botao-secundario"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await reconfigurar();
                    setAviso(r.erro ?? "Recebimento de mensagens configurado.");
                  })
                }
              >
                Reconfigurar recebimento
              </button>
              <button
                className="botao-secundario"
                disabled={pendente}
                onClick={() => {
                  if (!confirm("Desconectar o WhatsApp do CRM? Será preciso ler o QR Code de novo.")) return;
                  iniciar(async () => {
                    await desconectarWhatsapp();
                    setEstado(await statusWhatsapp());
                  });
                }}
              >
                Desconectar
              </button>
            </>
          ) : (
            estado.estado !== "erro" && (
              <button className="botao" disabled={pendente} onClick={conectar}>
                {qr ? "Gerar novo QR Code" : "Conectar WhatsApp"}
              </button>
            )
          )}
        </div>
      </div>

      {aviso && <p className="mt-4 text-sm text-slate-600">{aviso}</p>}
      {erro && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      {estado.estado === "erro" && (
        <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
          O CRM não conseguiu falar com a Evolution API. Confira se ela está ligada (veja docs/WHATSAPP.md).
        </p>
      )}

      {qr && estado.estado !== "open" && (
        <div className="mt-6 grid items-center gap-6 sm:grid-cols-[auto_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem gerada na hora (base64) */}
          <img src={qr} alt="QR Code para conectar o WhatsApp" className="h-64 w-64 rounded border border-slate-200" />
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Abra o WhatsApp no celular do número da empresa.</li>
            <li>Toque em <strong>⋮ Mais opções</strong> (Android) ou <strong>Configurações</strong> (iPhone).</li>
            <li>Toque em <strong>Aparelhos conectados → Conectar um aparelho</strong>.</li>
            <li>Aponte a câmera para este QR Code.</li>
            <li className="text-slate-500">O QR Code expira em cerca de 40 segundos. Se expirar, clique em &quot;Gerar novo QR Code&quot;.</li>
          </ol>
        </div>
      )}
    </section>
  );
}
