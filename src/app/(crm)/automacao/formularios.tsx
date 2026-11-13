"use client";
// Formulários da tela Automação (mostram o aviso de erro/ok sem recarregar).
import { useActionState, useEffect, useRef } from "react";
import { DIAS, type Horarios } from "@/lib/automacao/horario";
import { criarOpcao, criarSequencia, salvarBot, salvarHorario, type Resultado } from "./actions";

const MAX_PASSOS = 5; // igual a actions.ts

function Aviso({ estado }: { estado: Resultado }) {
  if (estado?.erro) return <p className="rounded bg-red-50 p-2 text-sm text-red-700">{estado.erro}</p>;
  if (estado?.ok) return <p className="rounded bg-green-50 p-2 text-sm text-green-700">{estado.ok}</p>;
  return null;
}

function useLimpar(estado: Resultado) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado?.ok) ref.current?.reset();
  }, [estado]);
  return ref;
}

/** Liga/desliga com destaque: deixa claro que mexe com mensagens para clientes. */
function Interruptor({ name, defaultChecked, children }: { name: string; defaultChecked: boolean; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-medium">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4" />
      {children}
    </label>
  );
}

export function FormHorario({ ativo, horarios, mensagem }: { ativo: boolean; horarios: Horarios; mensagem: string }) {
  const [estado, acao, enviando] = useActionState(salvarHorario, null);
  return (
    <form action={acao} className="space-y-4">
      <Interruptor name="horarioAtivo" defaultChecked={ativo}>
        Responder automaticamente quando a mensagem chegar fora do horário
      </Interruptor>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="pb-1 font-medium">Dia</th>
            <th className="pb-1 font-medium">Abre</th>
            <th className="pb-1 font-medium">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {DIAS.map((dia, i) => (
            <tr key={dia}>
              <td className="py-1 pr-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name={`aberto${i}`} defaultChecked={horarios[i].aberto} />
                  {dia}
                </label>
              </td>
              <td className="py-1 pr-2">
                <input type="time" name={`inicio${i}`} defaultValue={horarios[i].inicio} aria-label={`${dia}: abre`} className="campo py-1" />
              </td>
              <td className="py-1">
                <input type="time" name={`fim${i}`} defaultValue={horarios[i].fim} aria-label={`${dia}: fecha`} className="campo py-1" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <label htmlFor="mensagemForaHorario" className="rotulo">Mensagem de fora do horário</label>
        <textarea id="mensagemForaHorario" name="mensagemForaHorario" rows={4} defaultValue={mensagem} className="campo" />
        <p className="mt-1 text-xs text-slate-500">
          <code>{"{horario}"}</code> vira os dias e horas acima. <code>{"{, primeiro_nome}"}</code> vira “, Ana” (ou some, se não soubermos o nome).
          Enviada no máximo uma vez a cada 12 horas por conversa.
        </p>
      </div>
      <Aviso estado={estado} />
      <button className="botao" disabled={enviando}>Salvar horário</button>
    </form>
  );
}

export function FormBot({ ativo, boasVindas, horas }: { ativo: boolean; boasVindas: string; horas: number }) {
  const [estado, acao, enviando] = useActionState(salvarBot, null);
  return (
    <form action={acao} className="space-y-4">
      <Interruptor name="botAtivo" defaultChecked={ativo}>
        Chatbot ligado: novas conversas recebem o menu de opções
      </Interruptor>
      <div>
        <label htmlFor="botBoasVindas" className="rotulo">Mensagem de boas-vindas (vai antes das opções)</label>
        <textarea id="botBoasVindas" name="botBoasVindas" rows={3} defaultValue={boasVindas} className="campo" />
        <p className="mt-1 text-xs text-slate-500">
          Variáveis: <code>{"{, primeiro_nome}"}</code>, <code>{"{empresa}"}</code>, <code>{"{horario}"}</code>.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="botReativarHoras">Mostrar o menu de novo se a conversa ficou parada por</label>
        <input id="botReativarHoras" name="botReativarHoras" type="number" min={1} max={720} defaultValue={horas} className="campo w-20 py-1" />
        horas
      </div>
      <Aviso estado={estado} />
      <button className="botao" disabled={enviando}>Salvar chatbot</button>
    </form>
  );
}

type Item = { id: string; nome: string };

export function FormOpcao({ etiquetas, atendentes }: { etiquetas: Item[]; atendentes: Item[] }) {
  const [estado, acao, enviando] = useActionState(criarOpcao, null);
  const ref = useLimpar(estado);
  return (
    <form ref={ref} action={acao} className="space-y-2">
      <input name="rotulo" required maxLength={60} placeholder="Nome da opção (ex.: Orçamento de treinamento)" aria-label="Nome da opção" className="campo" />
      <textarea name="resposta" rows={2} placeholder="O que o bot responde quando o cliente escolhe (opcional)" aria-label="Resposta do bot" className="campo" />
      <div className="grid gap-2 sm:grid-cols-2">
        <select name="etiquetaId" defaultValue="" aria-label="Etiqueta" className="campo">
          <option value="">Sem etiqueta</option>
          {etiquetas.map((e) => (
            <option key={e.id} value={e.id}>Etiqueta: {e.nome}</option>
          ))}
        </select>
        <select name="atendenteId" defaultValue="" aria-label="Atendente" className="campo">
          <option value="">Fica na fila</option>
          {atendentes.map((a) => (
            <option key={a.id} value={a.id}>Passar para {a.nome}</option>
          ))}
        </select>
      </div>
      <Aviso estado={estado} />
      <button className="botao-secundario" disabled={enviando}>+ Adicionar opção</button>
    </form>
  );
}

export function FormSequencia() {
  const [estado, acao, enviando] = useActionState(criarSequencia, null);
  const ref = useLimpar(estado);
  // Sugestão: 1 dia, 3 dias, 7 dias.
  const sugestaoDias = [1, 3, 7, 14, 30];
  return (
    <form ref={ref} action={acao} className="space-y-3">
      <input name="nome" required maxLength={60} placeholder="Nome (ex.: Orçamento sem resposta)" aria-label="Nome da sequência" className="campo" />
      {Array.from({ length: MAX_PASSOS }, (_, n) => n + 1).map((i) => (
        <fieldset key={i} className="rounded border border-slate-200 p-2">
          <legend className="px-1 text-xs font-medium text-slate-600">
            Mensagem {i} {i > 1 && <span className="font-normal text-slate-400">(opcional)</span>}
          </legend>
          <div className="mb-1 flex flex-wrap items-center gap-1 text-xs text-slate-600">
            Enviar
            <input name={`dias${i}`} type="number" min={0} defaultValue={i <= 3 ? sugestaoDias[i - 1] : ""} aria-label={`Mensagem ${i}: dias`} className="campo w-16 py-1 text-xs" />
            dia(s) e
            <input name={`horas${i}`} type="number" min={0} max={23} defaultValue={0} aria-label={`Mensagem ${i}: horas`} className="campo w-16 py-1 text-xs" />
            hora(s) depois de iniciar
          </div>
          <textarea name={`texto${i}`} rows={2} required={i === 1} aria-label={`Mensagem ${i}: texto`} className="campo text-sm"
            placeholder={i === 1 ? "Oi {primeiro_nome}, conseguiu ver o orçamento que te mandei?" : ""} />
        </fieldset>
      ))}
      <Aviso estado={estado} />
      <button className="botao" disabled={enviando}>Criar sequência</button>
    </form>
  );
}
