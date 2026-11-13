// Cria as etiquetas e respostas rápidas padrão numa organização que já existe,
// sem apagar nada (pula o que já houver com o mesmo nome/atalho).
// Uso: npx tsx scripts/padroes-atendimento.mts [slug-da-organizacao]
import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { ETIQUETAS_PADRAO, RESPOSTAS_PADRAO } from "../src/lib/padroes-atendimento";

const slug = process.argv[2] ?? process.env.ORG_SLUG ?? "brigada-mg";
const c = new pg.Client(process.env.DATABASE_URL);
await c.connect();
const org = (await c.query(`select id from "Organizacao" where slug = $1`, [slug])).rows[0];
if (!org) throw new Error(`Organização "${slug}" não encontrada.`);

let etiquetas = 0;
for (const e of ETIQUETAS_PADRAO) {
  const r = await c.query(
    `insert into "Etiqueta" (id, "organizacaoId", nome, cor) values ($1, $2, $3, $4) on conflict ("organizacaoId", nome) do nothing`,
    [randomUUID(), org.id, e.nome, e.cor],
  );
  etiquetas += r.rowCount ?? 0;
}
let respostas = 0;
for (const r of RESPOSTAS_PADRAO) {
  const ja = await c.query(`select 1 from "RespostaRapida" where "organizacaoId" = $1 and atalho = $2 and "usuarioId" is null`, [org.id, r.atalho]);
  if (ja.rowCount) continue;
  await c.query(`insert into "RespostaRapida" (id, "organizacaoId", atalho, texto) values ($1, $2, $3, $4)`, [randomUUID(), org.id, r.atalho, r.texto]);
  respostas++;
}
console.log(`Criadas: ${etiquetas} etiqueta(s) e ${respostas} resposta(s) rápida(s) em "${slug}".`);
await c.end();
