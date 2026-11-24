// Teste da Fase F2 (cadastro público, convites, nova senha, limite de tentativas e
// campanhas só depois da aprovação), chamando as funções direto (sem o servidor). O
// caminho completo, pelas telas, está em scripts/testar-seguranca.mts.
// Os e-mails não saem: sem SMTP_HOST, ficam na "caixa de saída" de teste.
// Usa um banco descartável (criado e apagado aqui). Não toca no banco do CRM.
//
// Uso (com o banco local ligado):
//   npx tsx --conditions=react-server scripts/testar-cadastro.mts
import "dotenv/config";
import { codigoDoLink, ok, prepararBanco, titulo, totalPassou } from "./apoio/ambiente-teste.mjs";

delete process.env.SMTP_HOST; // nunca manda e-mail de verdade no teste
process.env.APP_URL = "https://crm.exemplo.test";
process.env.DONO_EMAIL = "dono@exemplo.test";
process.env.WHATSAPP_SIMULAR_ENVIO = "1";
process.env.AUTOMACAO_DESLIGADA = "1";
process.env.USUARIOS_POR_EMPRESA = "4";

const banco = await prepararBanco();
const { db } = await import("../src/lib/db");
const { caixaDeSaida, emailComBotao } = await import("../src/lib/email");
const conta = await import("../src/lib/conta");
const { criarEmpresa, ErroCadastro } = await import("../src/lib/empresas/criar");
const { dentroDoLimite } = await import("../src/lib/limite");
const { ondeLiberada } = await import("../src/lib/empresas/situacao");
const { conferirSenha, temSenha } = await import("../src/lib/senha");
const { emailValido, nomeParaEmail, normalizarEmail, umaLinha } = await import("../src/lib/validar");

const linkDe = (para: string, caminho: string) => {
  const e = [...caixaDeSaida].reverse().find((m) => m.para === para && m.texto.includes(caminho));
  return e ? codigoDoLink(e.texto) : null;
};
const ultimoPara = (para: string) => [...caixaDeSaida].reverse().find((m) => m.para === para);
const recusa = async (p: Promise<unknown>) => p.then(() => "", (e) => (e instanceof ErroCadastro ? e.message : `erro inesperado: ${e}`));

try {
  titulo("Regras puras");
  const t0 = 1_000_000;
  ok("limite: 3 por hora", [1, 2, 3].every(() => dentroDoLimite("teste:x", 3, 3600_000, t0)) && !dentroDoLimite("teste:x", 3, 3600_000, t0 + 10));
  ok("limite: libera depois da janela", dentroDoLimite("teste:x", 3, 3600_000, t0 + 3600_001));
  const html = emailComBotao({ para: "a@b.test", assunto: "x", saudacao: "Olá, <script>alert(1)</script>", paragrafos: ['"Empresa" & cia'], botao: "Ir", link: "https://x.test/?a=1&b=2" }).html!;
  ok("e-mail escapa o que a pessoa digitou", !html.includes("<script>") && html.includes("&lt;script&gt;") && html.includes("&quot;Empresa&quot; &amp; cia"));
  ok("e-mail válido: aceita os comuns", ["ana@empresa.com.br", "a.b+c@x-y.io", "u@xn--caf-dma.com"].every(emailValido));
  ok(
    "e-mail válido: recusa lista, nome, espaço, quebra de linha e formatos estranhos",
    ["a@x.com,b@y.com", "a@x.com b@y.com", "Ana <a@x.com>", "a@x.com\r\nBcc: b@y.com", "a@localhost", "a..b@x.com", ".a@x.com", "a@x..com", "a@-x.com", '"a b"@x.com', "a@x.c", `${"a".repeat(65)}@x.com`, "á@x.com"].every(
      (e) => !emailValido(normalizarEmail(e)),
    ),
  );
  ok("texto de uma linha tira quebras e controle", umaLinha("  Ana\r\n\tSouza  ", 20) === "Ana Souza");
  ok("nome no e-mail não leva endereço de site", !/golpe|www|http/.test(nomeParaEmail("Veja http://golpe.test e www.golpe.test golpe.com.br/x")) && nomeParaEmail("Clínica São José Ltda.") === "Clínica São José Ltda.");

  titulo("Cadastro público: nada nasce antes da confirmação");
  const email = "dona@empresa-nova.test";
  const pedido = { empresa: "Clínica Teste", ramo: "Saúde (clínica, consultório)", nome: "Dona Teste", email, telefone: "(31) 99999-0000" };
  await conta.processarPedidoDeCadastro(pedido);
  ok("pedido guardado, sem empresa e sem usuário", (await db.cadastroPendente.count()) === 1 && (await db.organizacao.count()) === 0 && (await db.usuario.count()) === 0);
  const codigo = linkDe(email, "/confirmar?codigo=")!;
  ok("o link usa o APP_URL", ultimoPara(email)!.texto.includes(`https://crm.exemplo.test/confirmar?codigo=${codigo}`));
  ok("o e-mail não leva os textos digitados no formulário", !ultimoPara(email)!.texto.includes("Clínica Teste") && !ultimoPara(email)!.texto.includes("Dona"));
  ok("no banco fica só o hash do código", (await db.cadastroPendente.findFirstOrThrow()).tokenHash !== codigo);

  // Outra pessoa pede com o mesmo e-mail: não atrapalha quem tem o primeiro link.
  await conta.processarPedidoDeCadastro({ ...pedido, empresa: "Empresa do intruso" });
  ok("dois pedidos com o mesmo e-mail convivem", (await db.cadastroPendente.count()) === 2 && (await conta.conferirCadastro(codigo))?.empresa === "Clínica Teste");
  ok("olhar o link não gasta", (await conta.conferirCadastro(codigo)) && (await conta.conferirCadastro(codigo)));
  ok("código inventado, mal formado ou de outro tipo não vale", !(await conta.conferirCadastro("x".repeat(43))) && !(await conta.conferirCadastro("../etc")) && !(await conta.conferirCodigoSenha(codigo)) && !(await conta.conferirConvite(codigo)));
  ok("vence em 48 horas", !(await conta.conferirCadastro(codigo, new Date(Date.now() + 49 * 3600_000))));

  const r = (await conta.concluirCadastro(codigo, "senha-da-dona-1"))!;
  const { org, admin } = r;
  ok("ao confirmar nascem a empresa e o administrador, com a senha da própria pessoa", admin.papel === "ADMIN" && admin.emailConfirmadoEm && (await conferirSenha("senha-da-dona-1", admin.senhaHash)));
  ok("empresa em teste, com ramo e aceite dos termos", org.situacao === "EM_TESTE" && org.ramo?.startsWith("Saúde") && org.termosVersao && org.termosAceitosEm);
  ok("campanhas bloqueadas até aprovar", org.campanhasLiberadas === false);
  ok("o link vale uma vez só, e os outros pedidos do e-mail somem", !(await conta.concluirCadastro(codigo, "outra-senha-1")) && (await db.cadastroPendente.count()) === 0);
  await conta.avisarDonoDoCadastro(org, admin, r.telefone);
  ok("dono do sistema recebe o aviso", caixaDeSaida.at(-1)!.para === "dono@exemplo.test" && caixaDeSaida.at(-1)!.texto.includes(org.nome));

  await conta.processarPedidoDeCadastro({ ...pedido, empresa: "De novo" });
  ok("e-mail que já tem conta: avisa o dono, sem link de cadastro e sem criar nada", /já tem uma conta/i.test(ultimoPara(email)!.assunto) && !ultimoPara(email)!.texto.includes("/confirmar") && (await db.cadastroPendente.count()) === 0);

  // Dois cliques ao mesmo tempo no mesmo link.
  await conta.processarPedidoDeCadastro({ ...pedido, email: "dupla@empresa-nova.test", empresa: "Dupla" });
  const dupla = linkDe("dupla@empresa-nova.test", "/confirmar?codigo=")!;
  const juntos = await Promise.allSettled([1, 2, 3, 4].map(() => conta.concluirCadastro(dupla, "senha-dupla-123")));
  ok("quatro confirmações ao mesmo tempo criam uma empresa só", juntos.filter((j) => j.status === "fulfilled" && j.value).length === 1 && (await db.organizacao.count({ where: { nome: "Dupla" } })) === 1);

  titulo("Cadastro do jeito antigo (conta não confirmada)");
  const antigo = async (emailAntigo: string, mudar: object = {}) => {
    const e = await criarEmpresa({ nome: `Antiga ${emailAntigo}`, admin: { nome: "Antigo", email: emailAntigo }, diasTeste: 14, cadastroPublico: { termosVersao: "x" } });
    await db.usuario.update({ where: { id: e.admin.id }, data: { criadoEm: new Date(Date.now() - 72 * 3600_000), ...mudar } });
    return e;
  };
  const a1 = await antigo("preso@x.test");
  ok("vencida, nunca usada e vazia: o e-mail é liberado", (await conta.liberarEmailNuncaUsado("preso@x.test")) && !(await db.organizacao.findUnique({ where: { id: a1.org.id } })));
  const a2 = await antigo("comdados@x.test");
  await db.cliente.create({ data: { organizacaoId: a2.org.id, nome: "Cliente importante" } });
  ok("com dados: nada é apagado", !(await conta.liberarEmailNuncaUsado("comdados@x.test")) && (await db.cliente.count({ where: { organizacaoId: a2.org.id } })) === 1);
  await antigo("recente@x.test", { criadoEm: new Date() });
  ok("recente (link ainda poderia valer): nada é apagado", !(await conta.liberarEmailNuncaUsado("recente@x.test")));
  await antigo("usada@x.test", { ultimoAcesso: new Date(Date.now() - 60 * 3600_000) });
  ok("que já entrou: nada é apagado", !(await conta.liberarEmailNuncaUsado("usada@x.test")));
  const a5 = await antigo("link@x.test");
  await conta.criarCodigoSenha(a5.admin.id);
  ok("com link de senha valendo: nada é apagado", !(await conta.liberarEmailNuncaUsado("link@x.test")));
  ok("conta confirmada nunca é liberada", !(await conta.liberarEmailNuncaUsado(email)));
  ok("empresa do script (sem cadastro público) nunca é apagada", await (async () => {
    const s = await criarEmpresa({ nome: "Do script", admin: { nome: "S", email: "script@x.test" } });
    await db.usuario.update({ where: { id: s.admin.id }, data: { criadoEm: new Date(Date.now() - 99 * 86_400_000) } });
    return !(await conta.liberarEmailNuncaUsado("script@x.test")) && s.admin.emailConfirmadoEm === null && !temSenha(s.admin.senhaHash);
  })());
  ok("e o dono do e-mail assume pelo \"Esqueci minha senha\"", await (async () => {
    await conta.processarPedidoDeSenha("comdados@x.test");
    const u = await conta.trocarSenhaPeloLink(linkDe("comdados@x.test", "/senha/nova?codigo=")!, "agora-e-minha-1");
    return u?.id === a2.admin.id && (await db.usuario.findUniqueOrThrow({ where: { id: u.id } })).emailConfirmadoEm;
  })());

  titulo("Nova senha");
  await conta.processarPedidoDeSenha(email);
  const senha1 = linkDe(email, "/senha/nova?codigo=")!;
  await conta.processarPedidoDeSenha(email);
  const senha2 = linkDe(email, "/senha/nova?codigo=")!;
  ok("pedir outro link não estraga o anterior", senha1 !== senha2 && (await conta.conferirCodigoSenha(senha1)) && (await conta.conferirCodigoSenha(senha2)));
  ok("vence em 1 hora", !(await conta.conferirCodigoSenha(senha2, new Date(Date.now() + 2 * 3600_000))));
  await db.usuario.update({ where: { id: admin.id }, data: { ativo: false } });
  ok("usuário desativado não usa o link", !(await conta.conferirCodigoSenha(senha2)) && !(await conta.trocarSenhaPeloLink(senha2, "nova-senha-123")));
  await db.usuario.update({ where: { id: admin.id }, data: { ativo: true } });
  await db.sessao.create({ data: { usuarioId: admin.id, tokenHash: "s1", expiraEm: new Date(Date.now() + 3600_000) } });
  const trocas = await Promise.all([1, 2, 3].map((n) => conta.trocarSenhaPeloLink(senha2, `senha-da-dona-${n}${n}${n}`)));
  ok("três usos ao mesmo tempo: só um troca", trocas.filter(Boolean).length === 1);
  ok("trocar invalida os outros links e derruba as sessões", !(await conta.conferirCodigoSenha(senha1)) && (await db.sessao.count({ where: { usuarioId: admin.id } })) === 0);
  const antes = caixaDeSaida.length;
  await conta.processarPedidoDeSenha("ninguem@x.test");
  ok("e-mail sem conta: nada é enviado", caixaDeSaida.length === antes);

  titulo("Convites");
  const convidar = (o: { id: string; nome: string }, e: string, papel: "VENDEDOR" | "ADMIN" = "VENDEDOR") => conta.criarConvite(o, { nome: "Convidado", email: e, papel });
  const c1 = await convidar(org, "ana@x.test");
  ok("convite não cria usuário", "convite" in c1 && !(await db.usuario.findUnique({ where: { email: "ana@x.test" } })));
  if (!c1.convite) throw new Error("sem convite");
  await conta.enviarConvite(c1.convite, c1.codigo, org);
  const linkAna = linkDe("ana@x.test", "/convite?codigo=")!;
  ok("o link vai para a pessoa, com o nome da empresa", linkAna === c1.codigo && ultimoPara("ana@x.test")!.texto.includes(org.nome));
  ok("convidar de novo não muda o convite que existe", "erro" in (await convidar(org, "ana@x.test", "ADMIN")) && (await db.convite.findFirstOrThrow({ where: { email: "ana@x.test" } })).papel === "VENDEDOR");

  // Conta que já existe em outra empresa.
  const outra = await criarEmpresa({ nome: "Outra empresa", admin: { nome: "O", email: "outra@x.test", senha: "senha-de-teste-123" } });
  const contaAntes = JSON.stringify(await db.usuario.findUniqueOrThrow({ where: { email: "outra@x.test" } }));
  const c2 = await convidar(org, "outra@x.test", "ADMIN");
  ok("convidar e-mail de outra empresa responde igual e aparece na lista", "convite" in c2 && (await db.convite.count({ where: { organizacaoId: org.id, email: "outra@x.test" } })) === 1);
  if (c2.convite) {
    await conta.enviarConvite(c2.convite, c2.codigo, org);
    ok("o dono do e-mail recebe só um aviso, sem link de convite", /já tem conta/.test(ultimoPara("outra@x.test")!.assunto) && !ultimoPara("outra@x.test")!.texto.includes("codigo="));
    ok("nem o código cria ou muda a conta", /já tem conta/.test(await recusa(conta.aceitarConvite(c2.codigo, "senha-do-intruso"))));
  }
  ok("a conta existente ficou idêntica", JSON.stringify(await db.usuario.findUniqueOrThrow({ where: { email: "outra@x.test" } })) === contaAntes);
  ok("e-mail da própria lista: diz que já está", "erro" in (await convidar(outra.org, "outra@x.test")));

  ok("aceitar vence em 3 dias", !(await conta.conferirConvite(linkAna, new Date(Date.now() + 73 * 3600_000))));
  const aceites = await Promise.allSettled([1, 2, 3].map(() => conta.aceitarConvite(linkAna, "senha-da-ana-123")));
  const ana = await db.usuario.findUnique({ where: { email: "ana@x.test" } });
  ok("três aceites ao mesmo tempo criam um usuário só, com a senha dela", aceites.filter((a) => a.status === "fulfilled" && a.value).length === 1 && ana?.papel === "VENDEDOR" && ana.emailConfirmadoEm && (await conferirSenha("senha-da-ana-123", ana.senhaHash)));
  ok("o convite foi gasto", !(await conta.conferirConvite(linkAna)));

  const c3 = await convidar(org, "bia@x.test");
  if (!c3.convite) throw new Error("sem convite");
  ok("outra empresa não renova o convite", !(await conta.renovarConvite(outra.org.id, c3.convite.id)) && (await conta.conferirConvite(c3.codigo)));
  const novo = await conta.renovarConvite(org.id, c3.convite.id);
  ok("renovar invalida o link anterior", novo && !(await conta.conferirConvite(c3.codigo)) && (await conta.conferirConvite(novo.codigo)));

  // Teto de 4: já há dona + ana + convite (outra) + convite (bia) = 4.
  ok("teto de usuários conta os convites", "erro" in (await convidar(org, "cheio@x.test")));
  const vazia = await criarEmpresa({ nome: "Teto", admin: { nome: "T", email: "teto@x.test", senha: "senha-de-teste-123" } });
  const varios = await Promise.all(Array.from({ length: 10 }, (_, i) => convidar(vazia.org, `t${i}@x.test`)));
  ok("dez convites ao mesmo tempo param no teto", varios.filter((v) => "convite" in v).length === 3 && (await conta.vagasUsadas(db, vazia.org.id)) === 4);

  titulo("Campanhas só depois da aprovação");
  const campanha = await db.campanha.create({ data: { organizacaoId: org.id, nome: "Teste", texto: "Olá", status: "RASCUNHO" } });
  const prontas = () => db.campanha.count({ where: { id: campanha.id, organizacao: { ...ondeLiberada(), campanhasLiberadas: true } } });
  ok("o relógio não pega campanha de empresa não aprovada", (await prontas()) === 0);
  await db.organizacao.update({ where: { id: org.id }, data: { campanhasLiberadas: true } });
  ok("depois de aprovada, pega", (await prontas()) === 1);

  titulo("Faxina");
  await db.cadastroPendente.create({ data: { email: "velho@x.test", nome: "V", empresa: "V", termosVersao: "x", tokenHash: "velho", expiraEm: new Date(Date.now() - 1000) } });
  await db.sessao.create({ data: { usuarioId: admin.id, tokenHash: "vencida", expiraEm: new Date(Date.now() - 1000) } });
  await db.sessao.create({ data: { usuarioId: admin.id, tokenHash: "valendo", expiraEm: new Date(Date.now() + 3600_000) } });
  await conta.limparContasVencidas();
  ok("apaga pedidos e sessões vencidos e mantém o resto", (await db.cadastroPendente.count()) === 0 && (await db.sessao.count()) === 1 && (await db.convite.count()) > 0);

  console.log(`\n${totalPassou()} verificações passaram.`);
} finally {
  await db.$disconnect();
  await banco.apagar();
  console.log("Banco de teste apagado.");
}
