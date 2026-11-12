import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cabecalho, Carregando, Etiqueta } from "@/components/ui";
import { exigirPapel, nomesPapel } from "@/lib/auth";
import { db } from "@/lib/db";
import { dataHora } from "@/lib/formatar";
import { temSenha } from "@/lib/senha";
import { alterarPapel, alternarAtivo } from "./actions";
import { FormNovoUsuario, FormRedefinirSenha } from "./formularios";

export const metadata: Metadata = { title: "Usuários" };

export default function PaginaUsuarios() {
  return (
    <>
      <Cabecalho titulo="Usuários" subtitulo="Quem acessa o CRM e o que cada um pode fazer" />
      <Suspense fallback={<Carregando />}>
        <Lista />
      </Suspense>
    </>
  );
}

async function Lista() {
  await connection();
  const admin = await exigirPapel("ADMIN");
  const usuarios = await db.usuario.findMany({
    where: { organizacaoId: admin.organizacao.id },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    include: { _count: { select: { sessoes: true } } },
  });

  return (
    <div className="space-y-6">
      <section className="cartao p-4">
        <h2 className="mb-3 text-sm font-semibold">Novo usuário</h2>
        <FormNovoUsuario />
      </section>

      <section className="cartao overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-4 py-3">Último acesso</th>
              <th className="px-4 py-3">Situação</th>
              <th className="px-4 py-3">Senha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {usuarios.map((u) => {
              const eu = u.id === admin.id;
              return (
                <tr key={u.id} className={u.ativo ? "" : "opacity-60"}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.nome}{eu && <span className="ml-1 text-xs text-slate-400">(você)</span>}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {/* key com o papel: depois de salvar, o React monta o select de novo
                        com o papel novo (um <select defaultValue> não se atualiza sozinho). */}
                    <form key={u.papel} action={alterarPapel.bind(null, u.id)} className="flex gap-1">
                      <select name="papel" defaultValue={u.papel} className="campo w-auto py-1 text-xs" aria-label={`Papel de ${u.nome}`}>
                        {Object.entries(nomesPapel).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                      </select>
                      <button className="botao-secundario px-2 py-1 text-xs">Salvar</button>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {u.ultimoAcesso ? dataHora(u.ultimoAcesso) : "nunca"}
                    {u._count.sessoes > 0 && <div>{u._count.sessoes} sessão(ões) aberta(s)</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Etiqueta cor={u.ativo ? "#16a34a" : "#64748b"}>{u.ativo ? "Ativo" : "Desativado"}</Etiqueta>
                      {!eu && (
                        <form action={alternarAtivo.bind(null, u.id)}>
                          <button className="text-xs text-slate-500 underline hover:text-slate-800">{u.ativo ? "Desativar" : "Reativar"}</button>
                        </form>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {!temSenha(u.senhaHash) && <div className="mb-1 text-xs font-medium text-amber-700">Sem senha (não consegue entrar)</div>}
                    {!eu ? <FormRedefinirSenha usuarioId={u.id} /> : <span className="text-xs text-slate-400">troque em Meu perfil</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="cartao p-4 text-sm text-slate-600">
        <h2 className="mb-2 font-semibold text-slate-800">O que cada papel faz</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Administrador:</strong> tudo, inclusive cadastrar usuários.</li>
          <li><strong>Gestor:</strong> tudo, menos cadastrar usuários.</li>
          <li><strong>Vendedor / Atendente:</strong> clientes, funil, WhatsApp, turmas e certificados.</li>
          <li><strong>Instrutor:</strong> por enquanto, o mesmo acesso do vendedor. As restrições por papel entram junto com a Central de atendimento.</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">Desativar um usuário ou redefinir a senha desconecta a pessoa de todos os aparelhos na hora.</p>
      </section>
    </div>
  );
}
