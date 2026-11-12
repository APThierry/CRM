// Formulário usado para criar e para editar uma turma.
import Link from "next/link";
import { db } from "@/lib/db";
import { paraInputData } from "@/lib/formatar";
import { getOrganizacaoAtual } from "@/lib/org";
import type { Turma } from "@/generated/prisma/client";
import { salvarTurma } from "./actions";

export async function FormularioTurma({ turma, clienteIdInicial }: { turma?: Turma; clienteIdInicial?: string }) {
  const org = await getOrganizacaoAtual();
  const [servicos, clientes, instrutores] = await Promise.all([
    db.servico.findMany({ where: { organizacaoId: org.id, ativo: true }, orderBy: { nome: "asc" } }),
    db.cliente.findMany({ where: { organizacaoId: org.id }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    db.usuario.findMany({
      where: { organizacaoId: org.id, ativo: true, papel: { in: ["INSTRUTOR", "ADMIN", "GESTOR"] } },
      orderBy: { nome: "asc" },
    }),
  ]);

  const acao = salvarTurma.bind(null, turma?.id ?? null);

  return (
    <form action={acao} className="cartao grid max-w-3xl gap-4 p-6 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="rotulo" htmlFor="servicoId">Curso *</label>
        <select id="servicoId" name="servicoId" required defaultValue={turma?.servicoId ?? ""} className="campo">
          <option value="" disabled>Selecione…</option>
          {servicos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
              {s.cargaHoraria ? ` (${s.cargaHoraria}h)` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="rotulo" htmlFor="dataInicio">Data de início *</label>
        <input id="dataInicio" name="dataInicio" type="date" required defaultValue={paraInputData(turma?.dataInicio)} className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="dataFim">Data de término</label>
        <input id="dataFim" name="dataFim" type="date" defaultValue={paraInputData(turma?.dataFim)} className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="modalidade">Modalidade</label>
        <select id="modalidade" name="modalidade" defaultValue={turma?.modalidade ?? "PRESENCIAL"} className="campo">
          <option value="PRESENCIAL">Presencial</option>
          <option value="EAD">EAD</option>
          <option value="HIBRIDO">Híbrido (EAD + prática)</option>
        </select>
      </div>
      <div>
        <label className="rotulo" htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={turma?.status ?? "PLANEJADA"} className="campo">
          <option value="PLANEJADA">Planejada</option>
          <option value="CONFIRMADA">Confirmada</option>
          <option value="REALIZADA">Realizada</option>
          <option value="CANCELADA">Cancelada</option>
        </select>
      </div>
      <div>
        <label className="rotulo" htmlFor="clienteId">Cliente (in company)</label>
        <select id="clienteId" name="clienteId" defaultValue={turma?.clienteId ?? clienteIdInicial ?? ""} className="campo">
          <option value="">Turma aberta (vários clientes)</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <div>
        <label className="rotulo" htmlFor="instrutorId">Instrutor</label>
        <select id="instrutorId" name="instrutorId" defaultValue={turma?.instrutorId ?? ""} className="campo">
          <option value="">—</option>
          {instrutores.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
      </div>
      <div>
        <label className="rotulo" htmlFor="local">Local</label>
        <input id="local" name="local" defaultValue={turma?.local ?? ""} placeholder="Ex.: Centro de Treinamento" className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="vagas">Vagas</label>
        <input id="vagas" name="vagas" type="number" min={1} defaultValue={turma?.vagas ?? ""} className="campo" />
      </div>
      <div className="sm:col-span-2">
        <label className="rotulo" htmlFor="observacoes">Observações</label>
        <textarea id="observacoes" name="observacoes" rows={3} defaultValue={turma?.observacoes ?? ""} className="campo" />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button className="botao">{turma ? "Salvar alterações" : "Criar turma"}</button>
        <Link href={turma ? `/turmas/${turma.id}` : "/turmas"} className="botao-secundario">Cancelar</Link>
      </div>
    </form>
  );
}
