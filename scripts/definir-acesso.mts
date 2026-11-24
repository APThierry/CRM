// Gera um link para alguém escolher a própria senha, direto no servidor (quem tem acesso
// ao terminal da VPS). Serve para:
// - dar acesso ao administrador da empresa do seed, mesmo que outras empresas já tenham
//   se cadastrado (o "primeiro acesso" da tela pode estar fechado);
// - quem perdeu o acesso e não recebe e-mail (ex.: SMTP ainda não configurado).
//
// Uso (conta que já existe):
//   npx tsx --conditions=react-server scripts/definir-acesso.mts email@empresa.com
// Uso (criar um administrador numa empresa que já existe):
//   npx tsx --conditions=react-server scripts/definir-acesso.mts email@empresa.com --empresa brigada-mg --nome "Nome da pessoa"
//
// O link vale 48 horas e funciona uma vez só. A senha atual continua valendo até a pessoa
// trocar. Nada é enviado: mande o link você mesmo, só para a pessoa.
import "dotenv/config";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { empresa: { type: "string" }, nome: { type: "string" } } });

const { db } = await import("../src/lib/db");
const { criarCodigoSenha, liberarEmailNuncaUsado } = await import("../src/lib/conta");
const { SEM_SENHA } = await import("../src/lib/senha");
const { emailValido, normalizarEmail, umaLinha } = await import("../src/lib/validar");

async function rodar() {
  const email = normalizarEmail(positionals[0]);
  if (!emailValido(email)) throw new Error('Uso: scripts/definir-acesso.mts email@empresa.com [--empresa slug --nome "Nome"]');

  // Um cadastro antigo, vazio e nunca confirmado com este e-mail não atrapalha.
  await liberarEmailNuncaUsado(email);
  let usuario = await db.usuario.findUnique({ where: { email }, include: { organizacao: { select: { nome: true, slug: true } } } });
  if (usuario && values.empresa && usuario.organizacao.slug !== values.empresa) {
    throw new Error(`Este e-mail já é da empresa "${usuario.organizacao.nome}" (${usuario.organizacao.slug}). Use outro e-mail.`);
  }
  if (!usuario) {
    if (!values.empresa) throw new Error("Não existe conta com este e-mail. Para criar um administrador, informe --empresa e --nome.");
    const org = await db.organizacao.findUnique({ where: { slug: values.empresa }, select: { id: true, nome: true } });
    if (!org) throw new Error(`Não existe empresa com o identificador "${values.empresa}".`);
    const nome = umaLinha(values.nome, 80);
    if (!nome) throw new Error("Informe --nome.");
    usuario = await db.usuario.create({
      data: { organizacaoId: org.id, nome, email, papel: "ADMIN", senhaHash: SEM_SENHA },
      include: { organizacao: { select: { nome: true, slug: true } } },
    });
    console.log(`Administrador criado em ${org.nome}.`);
  }
  if (!usuario.ativo) throw new Error("Esta conta está desativada. Reative na tela Usuários (ou no Prisma Studio) antes.");

  const codigo = await criarCodigoSenha(usuario.id, new Date(), 48 * 3600_000);
  const endereco = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  console.log(`${usuario.nome} <${usuario.email}>, ${usuario.papel} de ${usuario.organizacao.nome}`);
  console.log(`Link para escolher a senha (48 horas, uma vez só):\n${endereco}/senha/nova?codigo=${codigo}`);
}

try {
  await rodar();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
