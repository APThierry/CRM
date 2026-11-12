// Sobe um PostgreSQL 17 de verdade no seu PC, sem Docker e sem instalar nada.
// Uso: npm run db:local   (deixe o terminal aberto; Ctrl+C para parar)
//
// Os dados ficam na pasta .banco-local/ (fora do Git).
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const pasta = resolve(".banco-local");
const porta = 5433; // 5433 para não brigar com um PostgreSQL instalado na 5432

const pg = new EmbeddedPostgres({
  databaseDir: pasta,
  user: "postgres",
  password: "postgres",
  port: porta,
  persistent: true,
  // UTF-8 é obrigatório: sem isso o Windows cria o banco em WIN1252 e
  // mensagens com emoji (WhatsApp) não podem ser salvas.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

if (!existsSync(pasta)) {
  console.log("Criando o banco local pela primeira vez…");
  await pg.initialise();
}
await pg.start();

for (const nome of ["crm", "crm_shadow"]) {
  try {
    await pg.createDatabase(nome);
    console.log(`Banco "${nome}" criado.`);
  } catch {
    // já existe
  }
}

console.log(`PostgreSQL rodando em localhost:${porta} (bancos: crm, crm_shadow). Ctrl+C para parar.`);

const parar = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", parar);
process.on("SIGTERM", parar);
