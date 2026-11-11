import type { Metadata } from "next";
import Link from "next/link";
import { Cabecalho } from "@/components/ui";
import { criarCliente } from "../actions";

export const metadata: Metadata = { title: "Novo cliente" };

const segmentos = ["Indústria", "Condomínio", "Escola", "Saúde", "Construção civil", "Varejo", "Comércio", "Órgão público", "Outro"];
const origens = ["Indicação", "Google", "Instagram", "Site", "WhatsApp", "Ligação", "Cliente antigo", "Outro"];

export default function PaginaNovoCliente() {
  return (
    <>
      <Cabecalho titulo="Novo cliente" />
      <form action={criarCliente} className="cartao max-w-3xl space-y-6 p-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold">Dados do cliente</legend>
          <div className="sm:col-span-2">
            <label className="rotulo" htmlFor="nome">Nome / Razão social *</label>
            <input id="nome" name="nome" required className="campo" />
          </div>
          <div>
            <label className="rotulo" htmlFor="tipo">Tipo</label>
            <select id="tipo" name="tipo" className="campo">
              <option value="PJ">Empresa (PJ)</option>
              <option value="PF">Pessoa física (PF)</option>
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="documento">CNPJ / CPF</label>
            <input id="documento" name="documento" className="campo" />
          </div>
          <div>
            <label className="rotulo" htmlFor="nomeFantasia">Nome fantasia</label>
            <input id="nomeFantasia" name="nomeFantasia" className="campo" />
          </div>
          <div>
            <label className="rotulo" htmlFor="segmento">Segmento</label>
            <select id="segmento" name="segmento" className="campo" defaultValue="">
              <option value="">—</option>
              {segmentos.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="cidade">Cidade</label>
            <input id="cidade" name="cidade" className="campo" />
          </div>
          <div>
            <label className="rotulo" htmlFor="uf">UF</label>
            <input id="uf" name="uf" defaultValue="MG" maxLength={2} className="campo" />
          </div>
          <div>
            <label className="rotulo" htmlFor="origem">Como chegou até nós?</label>
            <select id="origem" name="origem" className="campo" defaultValue="">
              <option value="">—</option>
              {origens.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold">Contato principal</legend>
          <div>
            <label className="rotulo" htmlFor="contatoNome">Nome do contato</label>
            <input id="contatoNome" name="contatoNome" className="campo" />
          </div>
          <div>
            <label className="rotulo" htmlFor="contatoCargo">Cargo</label>
            <input id="contatoCargo" name="contatoCargo" placeholder="Ex.: Técnico de segurança" className="campo" />
          </div>
          <div>
            <label className="rotulo" htmlFor="whatsapp">WhatsApp</label>
            <input id="whatsapp" name="whatsapp" placeholder="(31) 99999-9999" className="campo" />
          </div>
          <div>
            <label className="rotulo" htmlFor="telefone">Telefone fixo</label>
            <input id="telefone" name="telefone" className="campo" />
          </div>
          <div className="sm:col-span-2">
            <label className="rotulo" htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" className="campo" />
          </div>
          <div className="sm:col-span-2">
            <label className="rotulo" htmlFor="observacoes">Observações</label>
            <textarea id="observacoes" name="observacoes" rows={3} className="campo" />
          </div>
        </fieldset>

        <div className="flex gap-2">
          <button className="botao">Salvar cliente</button>
          <Link href="/clientes" className="botao-secundario">Cancelar</Link>
        </div>
      </form>
    </>
  );
}
