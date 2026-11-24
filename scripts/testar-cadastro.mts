// Teste da Fase F2 (cadastro público, confirmação por e-mail, nova senha,
// limite de tentativas e campanhas só depois da aprovação) no banco local.
// Os e-mails não saem: sem SMTP_HOST, ficam na "caixa de saída" de teste.
// No fim, APAGA tudo o que criou.
//
// Uso (com o banco local ligado):
//   npx tsx --conditions=react-server scripts/testar-cadastro.mts
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

delete process.env.SMTP_HOST; // nunca manda e-mail de verdade no teste
process.env.APP_URL = "https://crm.exemplo.test";
process.env.DONO_EMAIL = "dono@exemplo.test";
process.env.WHATSAPP_SIMULAR_ENVIO = "1";
process.env.AUTOMACAO_DESLIGADA = "1";

const { db } = await import("../src/lib/db");
const { caixaDeSaida, emailComBotao } = await import("../src/lib/email");
const conta = await import("../src/lib/conta");
const { criarEmpresa } = await import("../src/lib/empresas/criar");
const { dentroDoLimite } = await import("../src/lib/limite");
const { ondeLiberada } = await import("../src/lib/empresas/situacao");
const { TERMOS_VERSAO } = await import("../src/lib/cadastro");

let passou = 0;
function ok(nome: string, condicao: unknown) {
  assert.ok(condicao, nome);
  passou++;
  console.log(`  ✔ ${nome}`);
}

console.log("Regras puras");
const t0 = 1_000_000;
ok("limite: 3 por hora", [1, 2, 3].every(() => dentroDoLimite("teste:x", 3, 3600_000, t0)) && !dentroDoLimite("teste:x", 3, 3600_000, t0 + 10));
ok("limite: libera depois da janela", dentroDoLimite("teste:x", 3, 3600_000, t0 + 3600_001));
const html = emailComBotao({ para: "a@b.test", assunto: "x", saudacao: "Olá, <script>alert(1)</script>", paragrafos: ['"Empresa" & cia'], botao: "Ir", link: "https://x.test/?a=1&b=2" }).html!;
ok("e-mail escapa o que a pessoa digitou", !html.includes("<script>") && html.includes("&lt;script&gt;") && html.includes("&quot;Empresa&quot; &amp; cia"));

const sufixo = randomBytes(3).toString("hex");
const criadas: string[] = [];
const linkDe = (para: string, caminho: string) => {
  const e = [...caixaDeSaida].reverse().find((m) => m.para === para && m.texto.includes(caminho));
  return e?.texto.match(/codigo=([\w-]+)/)?.[1] ?? null;
};

try {
  console.log("Cadastro público");
  const email = `dona-${sufixo}@empresa-nova.test`;
  const { org, admin } = await criarEmpresa({
    nome: `Clínica Teste ${sufixo}`,
    ramo: "Saúde (clínica, consultório)",
    admin: { nome: "Dona Teste", email, senha: "senha-de-teste-123" },
    diasTeste: 14,
    cadastroPublico: { termosVersao: TERMOS_VERSAO },
  });
  criadas.push(org.id);
  ok("empresa em teste, com ramo e aceite dos termos", org.situacao === "EM_TESTE" && org.ramo?.startsWith("Saúde") && org.termosVersao === TERMOS_VERSAO && org.termosAceitosEm);
  ok("campanhas bloqueadas até aprovar", org.campanhasLiberadas === false);
  ok("administrador ainda sem e-mail confirmado", admin.emailConfirmadoEm === null);

  const { org: viaScript } = await criarEmpresa({ nome: `Pelo script ${sufixo}`, admin: { nome: "S", email: `s-${sufixo}@empresa-nova.test`, senha: "senha-de-teste-123" } });
  criadas.push(viaScript.id);
  const adminScript = await db.usuario.findFirstOrThrow({ where: { organizacaoId: viaScript.id } });
  ok("empresa criada pelo script já vem confirmada e com campanhas", viaScript.campanhasLiberadas && adminScript.emailConfirmadoEm);

  console.log("E-mails");
  await conta.enviarConfirmacao(admin, org.nome);
  const codigo = linkDe(email, "/confirmar?codigo=");
  ok("confirmação vai para o e-mail, com o link do APP_URL", codigo && caixaDeSaida.at(-1)!.texto.includes(`https://crm.exemplo.test/confirmar?codigo=${codigo}`));
  await conta.avisarDonoDoCadastro(org, admin, "(31) 99999-0000");
  ok("dono do sistema recebe o aviso", caixaDeSaida.at(-1)!.para === "dono@exemplo.test" && caixaDeSaida.at(-1)!.texto.includes(org.nome));

  console.log("Códigos dos links");
  ok("código confere sem gastar", (await conta.conferirCodigo(codigo!, "CONFIRMAR_EMAIL"))?.id === admin.id && (await conta.conferirCodigo(codigo!, "CONFIRMAR_EMAIL"))?.id === admin.id);
  ok("código de um tipo não serve para o outro", !(await conta.conferirCodigo(codigo!, "NOVA_SENHA")));
  ok("código inventado ou mal formado não vale", !(await conta.conferirCodigo("x".repeat(43), "CONFIRMAR_EMAIL")) && !(await conta.conferirCodigo("../etc", "CONFIRMAR_EMAIL")));
  ok("usa uma vez só", (await conta.usarCodigo(codigo!, "CONFIRMAR_EMAIL"))?.id === admin.id && !(await conta.usarCodigo(codigo!, "CONFIRMAR_EMAIL")));

  await conta.enviarNovaSenha(admin);
  const senha1 = linkDe(email, "/senha/nova?codigo=");
  await conta.enviarNovaSenha(admin);
  const senha2 = linkDe(email, "/senha/nova?codigo=");
  ok("pedir outro link invalida o anterior", senha1 !== senha2 && !(await conta.conferirCodigo(senha1!, "NOVA_SENHA")) && (await conta.conferirCodigo(senha2!, "NOVA_SENHA")));
  const daquiDuasHoras = new Date(Date.now() + 2 * 3600_000);
  ok("link de senha nova vence em 1 hora", !(await conta.conferirCodigo(senha2!, "NOVA_SENHA", daquiDuasHoras)));
  await db.usuario.update({ where: { id: admin.id }, data: { ativo: false } });
  ok("usuário desativado não usa o link", !(await conta.conferirCodigo(senha2!, "NOVA_SENHA")));
  await db.usuario.update({ where: { id: admin.id }, data: { ativo: true } });

  console.log("Campanhas só depois da aprovação");
  const campanha = await db.campanha.create({ data: { organizacaoId: org.id, nome: "Teste", texto: "Olá", status: "RASCUNHO" } });
  const prontas = () => db.campanha.count({ where: { id: campanha.id, organizacao: { ...ondeLiberada(), campanhasLiberadas: true } } });
  ok("o relógio não pega campanha de empresa não aprovada", (await prontas()) === 0);
  await db.organizacao.update({ where: { id: org.id }, data: { campanhasLiberadas: true } });
  ok("depois de aprovada, pega", (await prontas()) === 1);

  console.log(`\n${passou} verificações passaram.`);
} finally {
  await db.organizacao.deleteMany({ where: { id: { in: criadas } } }); // o resto apaga junto (cascade)
  console.log(`Limpeza feita (${criadas.length} empresa(s) de teste apagadas).`);
  await db.$disconnect();
}
