// Cria uma empresa nova com o primeiro administrador (Fase F1).
// Enquanto a página de cadastro (F2) não existe, é assim que uma empresa entra.
//
// Uso:
//   npx tsx --conditions=react-server scripts/criar-empresa.mts "Nome da empresa" "Nome do admin" email@empresa.com [dias de teste]
//
// Sem "dias de teste", a empresa já nasce ATIVA. A senha é gerada aqui e mostrada
// uma vez só: passe para a pessoa, que troca em "Meu perfil" no primeiro acesso.
import "dotenv/config";
import { randomBytes } from "node:crypto";

const [nome, nomeAdmin, email, dias] = process.argv.slice(2);
if (!nome || !nomeAdmin || !email) {
  console.log('Uso: npx tsx --conditions=react-server scripts/criar-empresa.mts "Empresa" "Nome do admin" email@empresa.com [dias de teste]');
  process.exit(1);
}

const { db } = await import("../src/lib/db");
const { criarEmpresa, ErroCadastro } = await import("../src/lib/empresas/criar");

// 16 caracteres, com letras e números (atende às regras de senha do CRM).
const senha = `${randomBytes(9).toString("base64url")}a1`;
try {
  const { org, admin } = await criarEmpresa({ nome, admin: { nome: nomeAdmin, email, senha }, diasTeste: dias ? Number(dias) : undefined });
  console.log(`Empresa criada: ${org.nome} (${org.slug}), situação ${org.situacao}${org.testeAte ? ` até ${org.testeAte.toLocaleDateString("pt-BR")}` : ""}.`);
  console.log(`Administrador: ${admin.nome} <${admin.email}>`);
  console.log(`Senha provisória: ${senha}`);
} catch (e) {
  console.error(e instanceof ErroCadastro ? `Não criei: ${e.message}` : e);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
