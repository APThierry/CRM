"use client";
// Gera e mostra o link da agenda para colar no Google Agenda.
import { useActionState, useState } from "react";
import { desligarLinkAgenda, gerarLinkAgenda } from "./actions";

export function LinkAgenda({ ativo }: { ativo: boolean }) {
  const [estado, acao, gerando] = useActionState(gerarLinkAgenda, null);
  const [copiado, setCopiado] = useState(false);
  // Depois de "Desligar link", a página volta com ativo = false e o link some.
  const link = ativo ? estado?.link : undefined;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">
        As turmas (o instrutor vê só as dele), as suas tarefas com data e as mensagens de WhatsApp que você agendou aparecem no Google Agenda
        ou no calendário do celular. O Google atualiza sozinho a cada poucas horas.
      </p>

      {link ? (
        <div className="space-y-2 rounded-md border border-green-200 bg-green-50 p-3">
          <p className="font-medium text-green-900">Seu link (copie agora: por segurança ele não aparece de novo):</p>
          <div className="flex gap-2">
            <input readOnly value={link} className="campo font-mono text-xs" aria-label="Link da agenda" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="botao-secundario whitespace-nowrap"
              onClick={() => navigator.clipboard.writeText(link).then(() => setCopiado(true))}
            >
              {copiado ? "Copiado ✓" : "Copiar"}
            </button>
          </div>
          <ol className="list-decimal space-y-0.5 pl-5 text-xs text-green-900">
            <li>Abra o Google Agenda no computador (calendar.google.com).</li>
            <li>À esquerda, em &quot;Outras agendas&quot;, clique em <strong>+</strong> e depois em <strong>Do URL</strong>.</li>
            <li>Cole o link e clique em <strong>Adicionar agenda</strong>. Pronto: aparece também no celular.</li>
          </ol>
          <p className="text-xs text-green-900">
            Quem tiver este link vê a sua agenda. Não compartilhe. Se vazar, gere outro: o antigo para de funcionar.
          </p>
        </div>
      ) : (
        ativo && <p className="text-slate-600">✓ Você já tem um link ativo. Perdeu o link? Gere outro (o anterior deixa de funcionar).</p>
      )}
      {estado?.erro && <p className="rounded bg-red-50 p-2 text-red-700">{estado.erro}</p>}

      <div className="flex flex-wrap gap-2">
        <form action={acao}>
          <button className="botao" disabled={gerando}>{gerando ? "Gerando…" : ativo || link ? "Gerar outro link" : "Gerar link da agenda"}</button>
        </form>
        {(ativo || link) && (
          <form action={desligarLinkAgenda}>
            <button className="botao-secundario text-red-700">Desligar link</button>
          </form>
        )}
      </div>
    </div>
  );
}
