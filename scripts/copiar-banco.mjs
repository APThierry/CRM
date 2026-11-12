// Copia todos os dados de um banco PostgreSQL para outro com as mesmas tabelas.
// Usado para converter os bancos locais de WIN1252 para UTF-8.
// Uso: node scripts/copiar-banco.mjs <url-origem> <url-destino>
import pg from "pg";

const [origemUrl, destinoUrl] = process.argv.slice(2);
if (!origemUrl || !destinoUrl) {
  console.error("Uso: node scripts/copiar-banco.mjs <url-origem> <url-destino>");
  process.exit(1);
}

const origem = new pg.Client(origemUrl);
const destino = new pg.Client(destinoUrl);
await origem.connect();
await destino.connect();
await origem.query("SET client_encoding TO 'UTF8'");

// Desliga as checagens de chave estrangeira durante a cópia (a ordem das tabelas não importa).
await destino.query("SET session_replication_role = replica");

const tabelas = (
  await destino.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> '_prisma_migrations'
     order by table_name`,
  )
).rows.map((r) => r.table_name);

let total = 0;
for (const tabela of tabelas) {
  const colunas = (
    await destino.query(
      `select column_name, data_type from information_schema.columns
       where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [tabela],
    )
  ).rows;
  const existeNaOrigem = (
    await origem.query(`select 1 from information_schema.tables where table_schema='public' and table_name=$1`, [tabela])
  ).rowCount;
  if (!existeNaOrigem) continue;

  const nomes = colunas.map((c) => `"${c.column_name}"`).join(", ");
  const json = new Set(colunas.filter((c) => c.data_type === "json" || c.data_type === "jsonb").map((c) => c.column_name));
  const linhas = (await origem.query(`select ${nomes} from "${tabela}"`)).rows;

  for (let i = 0; i < linhas.length; i += 200) {
    const lote = linhas.slice(i, i + 200);
    const valores = [];
    const marcadores = lote.map((linha) => {
      const ps = colunas.map((c) => {
        const v = linha[c.column_name];
        valores.push(json.has(c.column_name) && v !== null ? JSON.stringify(v) : v);
        return `$${valores.length}`;
      });
      return `(${ps.join(", ")})`;
    });
    await destino.query(`insert into "${tabela}" (${nomes}) values ${marcadores.join(", ")}`, valores);
  }

  // Acerta contadores automáticos (colunas serial/identity), se houver.
  for (const c of colunas) {
    const seq = (await destino.query(`select pg_get_serial_sequence($1, $2) s`, [`"${tabela}"`, c.column_name])).rows[0].s;
    if (seq) await destino.query(`select setval($1, coalesce((select max("${c.column_name}") from "${tabela}"), 0) + 1, false)`, [seq]);
  }

  if (linhas.length) console.log(`${tabela}: ${linhas.length}`);
  total += linhas.length;
}

console.log(`Total: ${total} linhas copiadas.`);
await origem.end();
await destino.end();
