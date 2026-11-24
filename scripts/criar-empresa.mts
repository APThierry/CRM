// Cria uma empresa nova com o primeiro administrador (Fase F1).
// Outro caminho é a própria empresa se cadastrar na página "Criar conta" (F2).
//
// Uso:
//   npx tsx --conditions=react-server scripts/criar-empresa.mts "Nome da empresa" "Nome do admin" email@empresa.com [dias de teste]
//
// Sem "dias de teste", a empresa já nasce ATIVA. Nenhuma senha é criada aqui: o script
// mostra um LINK (vale 48 horas, uma vez só) para o administrador escolher a própria.
// Mande o link só para ele. Perdeu ou venceu? scripts/definir-acesso.mts gera outro.
import "dotenv/config";

const [nome, nomeAdmin, email, dias] = process.argv.slice(2);
if (!nome || !nomeAdmin || !email) {
  console.log('Uso: npx tsx --conditions=react-server scripts/criar-empresa.mts "Empresa" "Nome do admin" email@empresa.com [dias de teste]');
  process.exit(1);
}

const { db } = await import("../src/lib/db");
const { criarEmpresa, ErroCadastro } = await import("../src/lib/empresas/criar");
const { criarCodigoSenha } = await import("../src/lib/conta");

const endereco = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
try {
  const { org, admin } = await criarEmpresa({ nome, admin: { nome: nomeAdmin, email }, diasTeste: dias ? Number(dias) : undefined });
  const codigo = await criarCodigoSenha(admin.id, new Date(), 48 * 3600_000);
  console.log(`Empresa criada: ${org.nome} (${org.slug}), situação ${org.situacao}${org.testeAte ? ` até ${org.testeAte.toLocaleDateString("pt-BR")}` : ""}.`);
  console.log(`Administrador: ${admin.nome} <${admin.email}>`);
  console.log(`Link para escolher a senha (48 horas, uma vez só):\n${endereco}/senha/nova?codigo=${codigo}`);
} catch (e) {
  console.error(e instanceof ErroCadastro ? `Não criei: ${e.message}` : e);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
