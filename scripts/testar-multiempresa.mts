// Teste de isolamento entre empresas e de papéis (Fases F1 e segurança).
//
// Cria DUAS empresas num banco descartável (criado e apagado aqui; não toca no banco do
// CRM), liga o CRM compilado numa porta livre e confere, pelo servidor de verdade:
// - leitura: cada tela, planilha, agenda e arquivo mostra o que é da própria empresa e
//   nada da outra;
// - gravação: as Server Actions reais são chamadas com ids da OUTRA empresa (o que a
//   tela nunca faria) e nada muda; a MESMA chamada, feita pelo dono, funciona;
// - papéis: vendedor não conecta o WhatsApp nem mexe em turmas e certificados;
// - empresa suspensa: ninguém entra, o relógio e o chatbot param.
//
// Uso (com o banco local ligado e o build atual):
//   npm run build
//   npx tsx --conditions=react-server scripts/testar-multiempresa.mts
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { ate, codigoDoLink, conferirBuild, cookieDe, criarChamador, form, ligarEmail, ligarServidor, ok, pagina, prepararBanco, titulo, totalPassou } from "./apoio/ambiente-teste.mjs";

conferirBuild();
process.env.WHATSAPP_SIMULAR_ENVIO = "1";
process.env.AUTOMACAO_DESLIGADA = "1";
process.env.WEBHOOKS_PERMITIR_LOCAL = "1"; // só neste processo; o servidor é produção e ignora
process.env.EVOLUTION_API_URL = "http://127.0.0.1:1";

const banco = await prepararBanco();
const { conversa, dadosCompletos, db, empresa, numeroNovo, SENHA_TESTE, sufixo, usuario } = await import("./apoio/dados.mjs");
const { criarEmpresa, ErroCadastro } = await import("../src/lib/empresas/criar");
const { empresaLiberada, motivoBloqueio } = await import("../src/lib/empresas/situacao");
const { gerarSlug, nomeInstancia } = await import("../src/lib/empresas/preparar");
const { empresaDaInstancia, instanciaDaEmpresa } = await import("../src/lib/whatsapp/instancia");
const { aoReceberDoCliente } = await import("../src/lib/automacao/ao-receber");
const { processarAgendadas } = await import("../src/lib/automacao/relogio");
const { processarCampanhas } = await import("../src/lib/campanhas/motor");
const { dispararEvento, processarWebhooks } = await import("../src/lib/webhooks/disparar");
const { gerarCodigoAgenda } = await import("../src/lib/agenda");

const email = await ligarEmail();
let servidor: Awaited<ReturnType<typeof ligarServidor>> | undefined;

// Impressão digital de tudo o que é de uma empresa: se uma linha mudar, muda.
const COM_ORGANIZACAO = [
  "Usuario", "Cliente", "Contato", "EtapaFunil", "Negocio", "Servico", "Turma", "Participante", "Atividade", "MensagemWhatsapp", "ConfiguracaoWhatsapp", "Conversa",
  "Etiqueta", "RespostaRapida", "ConfiguracaoAutomacao", "OpcaoBot", "Sequencia", "MensagemAgendada", "Campanha", "Descadastro", "Webhook", "Convite", "EnvioDiario",
];
const LIGADAS: [tabela: string, onde: string][] = [
  ["Organizacao", `t.id = $1`],
  ["Matricula", `t."turmaId" in (select id from "Turma" where "organizacaoId" = $1)`],
  ["DestinatarioCampanha", `t."campanhaId" in (select id from "Campanha" where "organizacaoId" = $1)`],
  ["EntregaWebhook", `t."webhookId" in (select id from "Webhook" where "organizacaoId" = $1)`],
  ["PassoSequencia", `t."sequenciaId" in (select id from "Sequencia" where "organizacaoId" = $1)`],
  ["CodigoEmail", `t."usuarioId" in (select id from "Usuario" where "organizacaoId" = $1)`],
  ["_ConversaToEtiqueta", `t."A" in (select id from "Conversa" where "organizacaoId" = $1) or t."B" in (select id from "Etiqueta" where "organizacaoId" = $1)`],
];
async function retrato(organizacaoId: string) {
  const partes: string[] = [];
  for (const [tabela, onde] of [...COM_ORGANIZACAO.map((t): [string, string] => [t, `t."organizacaoId" = $1`]), ...LIGADAS]) {
    const [{ h }] = await db.$queryRawUnsafe<{ h: string }[]>(`select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h from "${tabela}" t where ${onde}`, organizacaoId);
    partes.push(`${tabela}:${h}`);
  }
  return partes;
}
const diferencas = (a: string[], b: string[]) => a.filter((x, i) => x !== b[i]).map((x) => x.split(":")[0]);

try {
  // --- 1. Regras puras -----------------------------------------------------------
  titulo("Situação da empresa");
  const hoje = new Date("2026-11-18T12:00:00Z");
  const amanha = new Date("2026-11-19T12:00:00Z");
  ok("ativa entra", empresaLiberada({ situacao: "ATIVA", testeAte: null }, hoje));
  ok("em teste entra até o fim do teste", empresaLiberada({ situacao: "EM_TESTE", testeAte: amanha }, hoje) && !empresaLiberada({ situacao: "EM_TESTE", testeAte: hoje }, amanha));
  ok("suspensa não entra, com aviso", !empresaLiberada({ situacao: "SUSPENSA", testeAte: null }, hoje) && /suspenso/.test(motivoBloqueio({ situacao: "SUSPENSA", testeAte: null }, hoje)!));
  ok("teste vencido tem aviso próprio", /teste/.test(motivoBloqueio({ situacao: "EM_TESTE", testeAte: hoje }, amanha)!));
  ok("slug sem acento e sem espaço", gerarSlug("Clínica São José Ltda.") === "clinica-sao-jose-ltda" && gerarSlug("!!!") === "empresa");

  // --- 2. Empresas ---------------------------------------------------------------
  titulo("Empresa nova");
  const MA = `Alfa${sufixo()}`;
  const MB = `Beta${sufixo()}`;
  const { org: orgA, admin: adminA } = await empresa(`Empresa ${MA}`);
  const { org: orgB, admin: adminB } = await empresa(`Empresa ${MB}`);
  const [etapas, etiquetas, automacao, zapA, zapB] = await Promise.all([
    db.etapaFunil.findMany({ where: { organizacaoId: orgB.id } }),
    db.etiqueta.count({ where: { organizacaoId: orgB.id } }),
    db.configuracaoAutomacao.findUnique({ where: { organizacaoId: orgB.id } }),
    db.configuracaoWhatsapp.findUnique({ where: { organizacaoId: orgA.id } }),
    db.configuracaoWhatsapp.findUnique({ where: { organizacaoId: orgB.id } }),
  ]);
  ok("já tem funil (com Ganho e Perdido), etiquetas e automação desligada", etapas.some((e) => e.tipo === "GANHO") && etapas.some((e) => e.tipo === "PERDIDO") && etiquetas > 0 && automacao && !automacao.botAtivo && !automacao.horarioAtivo);
  ok("primeiro usuário é administrador", adminB.papel === "ADMIN" && adminB.organizacaoId === orgB.id);
  ok("instância própria, com final sorteado", zapA!.instancia !== zapB!.instancia && new RegExp(`^crm-${orgB.slug}-[0-9a-f]{10}$`).test(zapB!.instancia!) && nomeInstancia("x") !== nomeInstancia("x"));
  await db.configuracaoWhatsapp.update({ where: { organizacaoId: orgA.id }, data: { instancia: "nome-antigo" } });
  ok("quem já tem nome de instância continua com ele", (await instanciaDaEmpresa(orgA.id)) === "nome-antigo");
  const recusou = await criarEmpresa({ nome: "Outra", admin: { nome: "X", email: adminB.email.toUpperCase() } }).then(() => "", (e) => (e instanceof ErroCadastro ? e.message : "outro erro"));
  ok("e-mail já usado em outra empresa é recusado", /já tem conta/.test(recusou));
  const gemeas = await Promise.all([1, 2, 3].map((i) => criarEmpresa({ nome: "Gêmea", admin: { nome: "G", email: `g${i}-${sufixo()}@x.test` } })));
  ok("três empresas com o mesmo nome, ao mesmo tempo, ganham slugs diferentes", new Set(gemeas.map((g) => g.org.slug)).size === 3);

  const a = await dadosCompletos(orgA.id, MA);
  const b = await dadosCompletos(orgB.id, MB);

  servidor = await ligarServidor(email.env);
  const { base, pasta } = servidor;
  const { chamar } = criarChamador(base);
  const cookieA = await cookieDe(db, adminA.id);
  const cookieB = await cookieDe(db, adminB.id);
  const texto = (html: string) => html.replace(/<!-- -->/g, "");

  // --- 3. Leitura ------------------------------------------------------------------
  titulo("Telas: cada empresa vê o que é dela (status 200 e conteúdo próprio) e nada da outra");
  type Dados = typeof a;
  const telas: [caminho: string | ((d: Dados) => string), esperado: (d: Dados, email: string) => string[]][] = [
    ["/", (d) => [`Tarefa ${d.marca}`, `Curso ${d.marca}`]],
    ["/funil", (d) => [`Negócio ${d.marca}`]],
    ["/clientes", (d) => [`Cliente ${d.marca}`]],
    [(d) => `/clientes/${d.cliente.id}`, (d) => [`Contato ${d.marca}`, `Mensagem ${d.marca}`]],
    ["/clientes/novo", () => []],
    ["/atendimento", (d) => [`Contato ${d.marca}`]],
    [(d) => `/atendimento?c=${d.conversa.id}`, (d) => [`Mensagem ${d.marca}`]],
    ["/atendimento/respostas", (d) => [`Resposta ${d.marca}`, `Etiqueta ${d.marca}`]],
    ["/turmas", (d) => [`Curso ${d.marca}`]],
    ["/turmas/nova", (d) => [`Curso ${d.marca}`]],
    [(d) => `/turmas/${d.turma.id}`, (d) => [`Aluno ${d.marca}`]],
    [(d) => `/turmas/${d.turma.id}/editar`, (d) => [`Local ${d.marca}`]],
    ["/certificados", (d) => [`Formado ${d.marca}`]],
    [(d) => `/certificados/${d.certificado.id}`, (d) => [`Formado ${d.marca}`]],
    ["/cursos", (d) => [`Curso ${d.marca}`]],
    ["/campanhas", (d) => [`Campanha ${d.marca}`]],
    ["/campanhas/nova", (d) => [`Curso ${d.marca}`]],
    [(d) => `/campanhas/${d.campanha.id}`, (d) => [`Texto ${d.marca}`]],
    ["/relatorios", (d) => [`Admin Empresa ${d.marca}`]],
    ["/relatorios?aba=vendas", () => []],
    ["/relatorios?aba=turmas", () => []],
    ["/automacao", (d) => [`Sequência ${d.marca}`]],
    ["/whatsapp", () => ["Conversas"]],
    ["/integracoes", (d) => [`Webhook ${d.marca}`, `segredo-${d.marca}`]],
    ["/usuarios", (_d, e) => [e]],
    ["/perfil", (_d, e) => [e]],
    ["/primeiros-passos", () => ["Conectar o WhatsApp da empresa"]],
  ];
  for (const [caminho, esperado] of telas) {
    for (const [d, outro, cookie, dono, intruso] of [
      [a, b, cookieA, adminA, adminB],
      [b, a, cookieB, adminB, adminA],
    ] as const) {
      const p = typeof caminho === "string" ? caminho : caminho(d);
      const r = await pagina(base, p, cookie);
      const html = texto(r.html);
      // O nome da empresa no menu prova que a tela abriu logada como ela.
      const faltou = [`Empresa ${d.marca}`, ...esperado(d, dono.email)].filter((m) => !html.includes(m));
      const vazou = [outro.marca, intruso.email, orgA.id === d.cliente.organizacaoId ? orgB.id : orgA.id].filter((m) => html.includes(m));
      if (r.status !== 200 || faltou.length || vazou.length) throw new Error(`FALHOU ${p}: status ${r.status}, faltou ${faltou}, vazou ${vazou}`);
    }
    ok(`${typeof caminho === "string" ? caminho : caminho({ ...a, cliente: { id: "…" }, conversa: { id: "…" }, turma: { id: "…" }, certificado: { id: "…" }, campanha: { id: "…" } } as unknown as Dados)}`, true);
  }

  titulo("Telas com o id da OUTRA empresa não abrem");
  for (const caminho of [`/clientes/${a.cliente.id}`, `/turmas/${a.turma.id}`, `/turmas/${a.turma.id}/editar`, `/certificados/${a.certificado.id}`, `/campanhas/${a.campanha.id}`, `/atendimento?c=${a.conversa.id}`]) {
    const doDono = texto((await pagina(base, caminho, cookieA)).html);
    const doIntruso = texto((await pagina(base, caminho, cookieB)).html);
    ok(`${caminho.replace(/[a-z0-9]{20,}/, "<id da A>")} (o dono abre, a outra não)`, doDono.includes(MA) && !doIntruso.includes(MA));
  }
  const semLogin = await pagina(base, "/clientes");
  ok("sem login vai para a tela de entrada", semLogin.status === 307 && semLogin.cabecalhos.get("location")?.endsWith("/login"));

  titulo("Planilhas, agenda e arquivos");
  const doCsv: Record<string, string> = { clientes: "Cliente ", negocios: "Negócio ", certificados: "Formado ", atendentes: "Admin Empresa " };
  for (const [tipo, prefixo] of Object.entries(doCsv)) {
    const [ra, rb] = await Promise.all([pagina(base, `/api/exportar/${tipo}.csv`, cookieA), pagina(base, `/api/exportar/${tipo}.csv`, cookieB)]);
    ok(`exportação ${tipo}.csv: só a própria empresa`, ra.status === 200 && rb.status === 200 && ra.html.includes(prefixo + MA) && !ra.html.includes(MB) && rb.html.includes(prefixo + MB) && !rb.html.includes(MA));
  }
  ok("exportação sem login: 401", (await pagina(base, "/api/exportar/clientes.csv")).status === 401);
  const [agA, agB] = [await gerarCodigoAgenda(adminA.id), await gerarCodigoAgenda(adminB.id)];
  const [icsA, icsB] = await Promise.all([pagina(base, `/api/agenda/${agA}.ics`), pagina(base, `/api/agenda/${agB}.ics`)]);
  ok("agenda: cada link mostra só a própria empresa", icsA.status === 200 && icsA.html.includes(`Curso ${MA}`) && !icsA.html.includes(MB) && icsB.html.includes(`Curso ${MB}`) && !icsB.html.includes(MA));
  ok("agenda usa o APP_URL, não o Host da requisição", icsA.html.includes("https://crm.exemplo.test/turmas/") && !icsA.html.includes("127.0.0.1"));
  ok("agenda com código errado: 404", (await pagina(base, `/api/agenda/${"x".repeat(32)}.ics`)).status === 404);

  mkdirSync(join(pasta, orgA.id, "2026-11"), { recursive: true });
  const conteudo = Buffer.from(`foto da ${MA}`);
  writeFileSync(join(pasta, orgA.id, "2026-11", "foto.jpg"), conteudo);
  const arquivo = `/api/arquivos/${orgA.id}/2026-11/foto.jpg`;
  const doDono = await fetch(base + arquivo, { headers: { cookie: cookieA } });
  ok("arquivo real: o dono lê (200, conteúdo igual)", doDono.status === 200 && Buffer.from(await doDono.arrayBuffer()).equals(conteudo) && doDono.headers.get("x-content-type-options") === "nosniff");
  ok("arquivo real: a outra empresa recebe 404", (await pagina(base, arquivo, cookieB)).status === 404);
  ok("arquivo real: sem login, 401", (await pagina(base, arquivo)).status === 401);
  const truques = [`/api/arquivos/${orgB.id}/..%2F${orgA.id}%2F2026-11%2Ffoto.jpg`, `/api/arquivos/${orgB.id}/..%5C${orgA.id}%5C2026-11%5Cfoto.jpg`, `/api/arquivos/${orgB.id}%2F..%2F${orgA.id}/2026-11/foto.jpg`];
  ok("truques com .. no caminho: 404", (await Promise.all(truques.map((t) => pagina(base, t, cookieB)))).every((r) => r.status === 404));

  // --- 4. Gravação -------------------------------------------------------------------
  titulo("Server Actions com ids da outra empresa: nada muda; a mesma chamada, pelo dono, funciona");
  const colegaA = await usuario(orgA.id, "VENDEDOR", `Colega ${MA}`);
  const conviteDeA = () => db.convite.create({ data: { organizacaoId: orgA.id, nome: "Convidado", email: `c-${sufixo()}@x.test`, tokenHash: sufixo() + sufixo(), expiraEm: new Date(Date.now() + 3600_000) } });
  type Caso = {
    acao: string;
    /** `d`: dados de quem é o alvo (A). `proprio`: dados de quem está chamando. */
    args: (d: Dados, proprio: Dados) => unknown[];
    preparar?: (d: Dados) => Promise<unknown>;
    nome?: string;
    /** O efeito acontece depois da resposta. */
    depois?: boolean;
  };
  const casos: Caso[] = [
    { acao: "clientes.adicionarAtividade", args: (d) => [d.cliente.id, form({ descricao: "invadida", tipo: "NOTA" })] },
    { acao: "clientes.alternarConclusao", args: (d) => [d.atividade.id] },
    { acao: "funil.moverNegocio", args: (d, p) => [d.negocio.id, p.etapas[2].id] },
    { acao: "funil.moverNegocio", nome: "meu negócio na etapa dos outros", args: (d, p) => [p.negocio.id, d.etapas[2].id] },
    { acao: "funil.moverNegocioPeloFormulario", args: (d, p) => [d.negocio.id, form({ etapaId: p.etapas[1].id })] },
    { acao: "funil.criarNegocio", args: (d) => [form({ clienteId: d.cliente.id, titulo: "invadido", valor: "10" })] },
    { acao: "atendimento.enviarMensagem", args: (d) => [d.conversa.id, null, form({ texto: "invadida" })] },
    { acao: "atendimento.marcarLida", args: (d) => [d.conversa.id], preparar: (d) => db.conversa.update({ where: { id: d.conversa.id }, data: { naoLidas: 3 } }) },
    { acao: "atendimento.assumirConversa", args: (d) => [d.conversa.id] },
    { acao: "atendimento.transferirConversa", args: (d) => [d.conversa.id, form({ atendenteId: "" })], preparar: (d) => db.conversa.update({ where: { id: d.conversa.id }, data: { atendenteId: adminA.id } }) },
    { acao: "atendimento.finalizarConversa", args: (d) => [d.conversa.id] },
    { acao: "atendimento.reabrirConversa", args: (d) => [d.conversa.id], preparar: (d) => db.conversa.update({ where: { id: d.conversa.id }, data: { status: "FINALIZADA" } }) },
    { acao: "atendimento.alternarEtiqueta", args: (d, p) => [d.conversa.id, p.etiqueta.id] },
    { acao: "atendimento.alternarEtiqueta", nome: "minha conversa com a etiqueta dos outros", args: (d, p) => [p.conversa.id, d.etiqueta.id] },
    { acao: "atendimento.cadastrarClienteDaConversa", args: (d) => [d.conversa.id, form({ nome: "invadido" })], preparar: (d) => db.conversa.update({ where: { id: d.conversa.id }, data: { clienteId: null, contatoId: null } }) },
    { acao: "atendimento.vincularClienteExistente", nome: "minha conversa no cliente dos outros", args: (d, p) => [p.conversa.id, form({ clienteId: d.cliente.id })] },
    { acao: "atendimento.desvincularCliente", args: (d) => [d.conversa.id] },
    { acao: "atendimento.criarNegocioDaConversa", args: (d) => [d.conversa.id, form({ valor: "1" })] },
    { acao: "atendimento.agendarNaConversa", args: (d) => [d.conversa.id, null, form({ texto: "invadida", enviarEm: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16) })] },
    { acao: "atendimento.iniciarSequenciaNaConversa", nome: "minha conversa com a sequência dos outros", args: (d, p) => [p.conversa.id, null, form({ sequenciaId: d.sequencia.id })] },
    { acao: "atendimento.cancelarAgendada", args: (d) => [d.agendada.id] },
    { acao: "atendimento/respostas.apagarResposta", args: (d) => [d.resposta.id] },
    { acao: "atendimento/respostas.apagarEtiqueta", args: (d) => [d.etiqueta.id] },
    { acao: "automacao.apagarOpcao", args: (d) => [d.opcao.id] },
    { acao: "automacao.apagarSequencia", args: (d) => [d.sequencia.id] },
    { acao: "automacao.criarOpcao", nome: "opção com a etiqueta dos outros", args: (d) => [null, form({ rotulo: "x", etiquetaId: d.etiqueta.id })] },
    { acao: "automacao.criarOpcao", nome: "opção com o atendente dos outros", args: () => [null, form({ rotulo: "y", atendenteId: colegaA.id })] },
    { acao: "campanhas.iniciarCampanha", args: (d) => [d.campanha.id, form({})] },
    { acao: "campanhas.pausarCampanha", args: (d) => [d.campanha.id], preparar: (d) => db.campanha.update({ where: { id: d.campanha.id }, data: { status: "ENVIANDO" } }) },
    { acao: "campanhas.cancelarCampanha", args: (d) => [d.campanha.id] },
    { acao: "campanhas.excluirRascunho", args: (d) => [d.campanha.id] },
    { acao: "campanhas.tirarDestinatario", args: (d) => [d.campanha.id, d.campanha.destinatarios[0].id] },
    { acao: "campanhas.salvarTexto", args: (d) => [d.campanha.id, null, form({ texto: "invadido" })] },
    { acao: "integracoes.salvarEventos", args: (d) => [d.webhook.id, null, form({ url: "https://93.184.216.34/invadido", eventos: ["cliente.criado"] })] },
    { acao: "integracoes.alternarWebhook", args: (d) => [d.webhook.id] },
    { acao: "integracoes.excluirWebhook", args: (d) => [d.webhook.id] },
    { acao: "integracoes.trocarSegredo", args: (d) => [d.webhook.id] },
    { acao: "integracoes.testarWebhook", args: (d) => [d.webhook.id, null], preparar: (d) => db.webhook.update({ where: { id: d.webhook.id }, data: { url: "https://127.0.0.1/" } }) },
    { acao: "integracoes.reenviarEntrega", args: (d) => [d.entrega.id] },
    { acao: "usuarios.alterarPapel", args: () => [colegaA.id, form({ papel: "INSTRUTOR" })], preparar: () => db.usuario.update({ where: { id: colegaA.id }, data: { papel: "VENDEDOR" } }) },
    { acao: "usuarios.alternarAtivo", args: () => [colegaA.id], preparar: () => db.usuario.update({ where: { id: colegaA.id }, data: { ativo: true } }) },
    { acao: "usuarios.mandarLinkDeSenha", args: () => [colegaA.id, null], preparar: () => db.usuario.update({ where: { id: colegaA.id }, data: { ativo: true } }), depois: true },
    { acao: "turmas.salvarTurma", args: (d, p) => [d.turma.id, form({ servicoId: p.servico.id, dataInicio: "2027-01-10", local: "invadido" })] },
    { acao: "turmas.salvarTurma", nome: "turma nova com o curso dos outros", args: (d) => [null, form({ servicoId: d.servico.id, dataInicio: "2027-01-10" })] },
    { acao: "turmas.alterarStatusTurma", args: (d) => [d.turma.id, "CONFIRMADA"] },
    { acao: "turmas.inscreverParticipante", args: (d) => [d.turma.id, form({ nome: "Invasor" })] },
    { acao: "turmas.removerInscricao", args: (d) => [d.matricula.id] },
    { acao: "turmas.marcarPresenca", args: (d) => [d.matricula.id, true] },
    { acao: "turmas.definirResultado", args: (d) => [d.matricula.id, true] },
    { acao: "turmas.concluirTurma", args: (d) => [d.turma.id] },
    { acao: "whatsapp.enviarParaCliente", args: (d) => [d.cliente.id, null, form({ texto: "invadida" })] },
  ];
  for (const caso of casos) {
    const d = await dadosCompletos(orgA.id, `${MA}x${sufixo()}`);
    await caso.preparar?.(d);
    const [antesA, antesB] = [await retrato(orgA.id), await retrato(orgB.id)];
    const ataque = await chamar(caso.acao, caso.args(d, b), { cookie: cookieB });
    if (caso.depois) await new Promise((r) => setTimeout(r, 400));
    const [mudouA, mudouB] = [diferencas(antesA, await retrato(orgA.id)), diferencas(antesB, await retrato(orgB.id))];
    if (mudouA.length || mudouB.length) throw new Error(`FALHOU ${caso.acao}: a empresa B mudou ${mudouA} da A e ${mudouB} dela (status ${ataque.status})`);
    const dono = await chamar(caso.acao, caso.args(d, d), { cookie: cookieA });
    const mudou = await ate(async () => diferencas(antesA, await retrato(orgA.id)).length > 0, `${caso.acao}: o dono também não conseguiu (status ${dono.status}: ${dono.texto.slice(0, 200)})`, caso.depois ? 5_000 : 300);
    ok(`${caso.acao}${caso.nome ? ` (${caso.nome})` : ""}`, mudou);
  }
  // Estas mudam a lista de convites; a action devolve o resultado.
  for (const acao of ["usuarios.reenviarConvite", "usuarios.cancelarConvite"]) {
    const convite = await conviteDeA();
    const antes = await retrato(orgA.id);
    await chamar(acao, acao.endsWith("cancelarConvite") ? [convite.id] : [convite.id, null], { cookie: cookieB });
    const intacto = diferencas(antes, await retrato(orgA.id)).length === 0;
    await chamar(acao, acao.endsWith("cancelarConvite") ? [convite.id] : [convite.id, null], { cookie: cookieA });
    ok(acao, intacto && diferencas(antes, await retrato(orgA.id)).includes("Convite"));
  }
  const semSessao = await retrato(orgA.id);
  const anonimas = await Promise.all([
    chamar("clientes.adicionarAtividade", [a.cliente.id, form({ descricao: "x" })], { cookie: "crm_sessao=inventado" }),
    chamar("turmas.definirResultado", [a.matricula.id, true], { cookie: "crm_sessao=inventado" }),
    chamar("usuarios.alternarAtivo", [colegaA.id], { cookie: "crm_sessao=inventado" }),
  ]);
  ok("com sessão inventada, as actions mandam para o login e nada muda", anonimas.every((r) => r.redirecionou === "/login") && diferencas(semSessao, await retrato(orgA.id)).length === 0);
  const deFora = await chamar("clientes.adicionarAtividade", [a.cliente.id, form({ descricao: "x" })], { cookie: cookieA, cabecalhos: { origin: "https://site-do-mal.test" } });
  ok("chamada vinda de outro site (Origin diferente) é recusada", deFora.status === 500 && diferencas(semSessao, await retrato(orgA.id)).length === 0);

  titulo("Papéis");
  const pessoas = { VENDEDOR: await usuario(orgA.id, "VENDEDOR"), INSTRUTOR: await usuario(orgA.id, "INSTRUTOR"), GESTOR: await usuario(orgA.id, "GESTOR") };
  const cookies = { VENDEDOR: await cookieDe(db, pessoas.VENDEDOR.id), INSTRUTOR: await cookieDe(db, pessoas.INSTRUTOR.id), GESTOR: await cookieDe(db, pessoas.GESTOR.id) };
  const negada = (r: { redirecionou: string | null }) => r.redirecionou === "/?sem-permissao=1";
  const daTurma = (d: Dados): [string, unknown[]][] => [
    ["turmas.salvarTurma", [d.turma.id, form({ servicoId: d.servico.id, dataInicio: "2027-02-02" })]],
    ["turmas.alterarStatusTurma", [d.turma.id, "CONFIRMADA"]],
    ["turmas.inscreverParticipante", [d.turma.id, form({ nome: "Novo" })]],
    ["turmas.marcarPresenca", [d.matricula.id, true]],
    ["turmas.definirResultado", [d.matricula.id, true]],
    ["turmas.concluirTurma", [d.turma.id]],
    ["turmas.removerInscricao", [d.matricula.id]],
  ];
  for (const papel of ["VENDEDOR", "INSTRUTOR", "GESTOR"] as const) {
    const pode = papel !== "VENDEDOR";
    for (const [acao] of daTurma(a)) {
      const d = await dadosCompletos(orgA.id, `${MA}p${sufixo()}`);
      if (acao === "turmas.concluirTurma") await db.matricula.update({ where: { id: d.matricula.id }, data: { presente: true } });
      const antes = await retrato(orgA.id);
      const r = await chamar(acao, daTurma(d).find(([n]) => n === acao)![1], { cookie: cookies[papel] });
      const mudou = diferencas(antes, await retrato(orgA.id)).length > 0;
      if (pode ? !mudou : mudou || !negada(r)) throw new Error(`FALHOU: ${papel} em ${acao} (mudou: ${mudou}, foi para ${r.redirecionou}, status ${r.status})`);
    }
    ok(`${papel}: ${pode ? "altera" : "NÃO altera"} turma, inscrição, presença, resultado e certificado (${daTurma(a).length} ações)`, true);
  }
  const doWhatsapp = ["whatsapp.statusWhatsapp", "whatsapp.iniciarConexao", "whatsapp.reconfigurar", "whatsapp.desconectarWhatsapp"];
  for (const papel of ["VENDEDOR", "INSTRUTOR"] as const) {
    const antes = await retrato(orgA.id);
    const rs = await Promise.all(doWhatsapp.map((acao) => chamar(acao, [], { cookie: cookies[papel] })));
    ok(`${papel}: não consulta, conecta, reconfigura nem desconecta o WhatsApp`, rs.every(negada) && diferencas(antes, await retrato(orgA.id)).length === 0);
  }
  const doGestor = await chamar("whatsapp.statusWhatsapp", [], { cookie: cookies.GESTOR });
  ok("GESTOR: consulta o WhatsApp (controle)", !doGestor.redirecionou && (doGestor.valor as { estado?: string })?.estado === "erro"); // a Evolution está desligada no teste
  for (const [caminho, marca] of [["/whatsapp", "Abrir a Central de atendimento"], ["/turmas/nova", `Curso ${MA}`], [`/turmas/${a.turma.id}/editar`, `Local ${MA}`]] as const) {
    const v = await pagina(base, caminho, cookies.VENDEDOR);
    const g = await pagina(base, caminho, cookies.GESTOR);
    ok(`${caminho.replace(/[a-z0-9]{20,}/, "<id>")}: vendedor é mandado para o painel, gestor abre`, !texto(v.html).includes(marca) && v.html.includes("sem-permissao") && g.status === 200 && texto(g.html).includes(marca));
  }
  const turmaVendedor = texto((await pagina(base, `/turmas/${a.turma.id}`, cookies.VENDEDOR)).html);
  const turmaInstrutor = texto((await pagina(base, `/turmas/${a.turma.id}`, cookies.INSTRUTOR)).html);
  const botoes = ["Inscrever aluno", "Mudar status", "Presente</button>", "Aprovado</button>", ">Editar</a>"];
  ok("tela da turma: vendedor vê os alunos, sem os botões; instrutor vê os botões", turmaVendedor.includes(`Aluno ${MA}`) && botoes.filter((x) => turmaVendedor.includes(x)).join() === "" && botoes.every((x) => turmaInstrutor.includes(x)));
  ok("lista de turmas: vendedor não vê + Nova turma", !texto((await pagina(base, "/turmas", cookies.VENDEDOR)).html).includes("+ Nova turma") && texto((await pagina(base, "/turmas", cookies.INSTRUTOR)).html).includes("+ Nova turma"));
  const antesPapel = await retrato(orgA.id);
  const proibidas = await Promise.all([
    chamar("campanhas.cancelarCampanha", [a.campanha.id], { cookie: cookies.VENDEDOR }),
    chamar("integracoes.alternarWebhook", [a.webhook.id], { cookie: cookies.GESTOR }),
    chamar("usuarios.convidarUsuario", [null, form({ nome: "X", email: "x@x.test", papel: "ADMIN" })], { cookie: cookies.GESTOR }),
    chamar("usuarios.alterarPapel", [pessoas.VENDEDOR.id, form({ papel: "ADMIN" })], { cookie: cookies.VENDEDOR }),
  ]);
  ok("vendedor não mexe em campanhas; só administrador mexe em integrações e usuários", proibidas.every(negada) && diferencas(antesPapel, await retrato(orgA.id)).length === 0);
  ok("exportação: vendedor recebe 403", (await pagina(base, "/api/exportar/clientes.csv", cookies.VENDEDOR)).status === 403);

  // --- 5. WhatsApp -------------------------------------------------------------------
  titulo("WhatsApp (cada número é de uma empresa)");
  const avisar = async (instance: string, telefone: string, id: string, segredo = "segredo-de-teste-do-webhook") => {
    const r = await fetch(`${base}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-crm-segredo": segredo },
      body: JSON.stringify({
        event: "messages.upsert",
        instance,
        data: { key: { id, remoteJid: `${telefone}@s.whatsapp.net`, fromMe: false }, pushName: "Fulano", message: { conversation: "oi, quero um orçamento" }, messageTimestamp: Math.floor(Date.now() / 1000) },
      }),
    });
    return { status: r.status, ...((await r.json()) as { salvas?: number; ignorada?: string }) };
  };
  const telB = numeroNovo();
  const r1 = await avisar(zapB!.instancia!, telB, "iso-1");
  const conversaB = await db.conversa.findFirst({ where: { telefone: telB } });
  ok("mensagem do número da empresa B cai na empresa B", r1.salvas === 1 && conversaB?.organizacaoId === orgB.id);
  const r1a = await avisar("nome-antigo", telB, "iso-1a");
  ok("o mesmo telefone escrevendo para a A vira outra conversa, da A", r1a.salvas === 1 && (await db.conversa.count({ where: { telefone: telB } })) === 2);
  const telX = numeroNovo();
  ok("instância desconhecida é ignorada", (await avisar("instancia-que-nao-existe", telX, "iso-2")).ignorada && (await db.conversa.count({ where: { telefone: telX } })) === 0);
  ok("segredo errado: 401 e nada gravado", (await avisar(zapB!.instancia!, telX, "iso-3", "errado")).status === 401 && (await db.conversa.count({ where: { telefone: telX } })) === 0);
  ok("a instância diz de quem é", (await empresaDaInstancia(zapB!.instancia)) === orgB.id && (await empresaDaInstancia("nenhuma")) === null);

  // --- 6. Suspensa ---------------------------------------------------------------------
  titulo("Empresa suspensa (funções verdadeiras do relógio, só nas empresas do teste)");
  const recebidos: string[] = [];
  const receptor = createServer((req, res) => {
    recebidos.push(req.url ?? "");
    res.end("ok");
  });
  await new Promise<void>((r) => receptor.listen(0, "127.0.0.1", r));
  const urlReceptor = `http://127.0.0.1:${(receptor.address() as AddressInfo).port}`;
  const quarta = new Date("2026-11-18T13:00:00Z");
  await db.webhook.deleteMany({});
  await db.mensagemAgendada.deleteMany({});
  await db.campanha.deleteMany({});
  for (const [org, m] of [[orgA, "A"], [orgB, "B"]] as const) {
    const conv = await conversa(org.id);
    await db.mensagemAgendada.create({ data: { organizacaoId: org.id, conversaId: conv.id, texto: "follow-up", enviarEm: new Date(Date.now() - 60_000) } });
    await db.webhook.create({ data: { organizacaoId: org.id, nome: m, url: `${urlReceptor}/${m}`, segredo: "x", eventos: ["negocio.ganho"] } });
    await dispararEvento(org.id, "negocio.ganho", { x: 1 });
    await db.campanha.create({
      data: { organizacaoId: org.id, nome: m, texto: "Oi", status: "AGENDADA", destinatarios: { create: [{ nome: "X", telefone: conv.telefone, chave: conv.chave, ordem: 0 }] } },
    });
  }
  await db.configuracaoAutomacao.update({ where: { organizacaoId: orgB.id }, data: { botAtivo: true } });
  const situacaoDe = async (org: { id: string }) => ({
    agendadas: await db.mensagemAgendada.count({ where: { organizacaoId: org.id, status: "ENVIADA" } }),
    webhooks: await db.entregaWebhook.count({ where: { webhook: { organizacaoId: org.id }, status: "ENTREGUE" } }),
    campanhas: await db.destinatarioCampanha.count({ where: { campanha: { organizacaoId: org.id }, status: "ENVIADA" } }),
  });
  const rodada = async (orgs: string[]) => {
    await processarAgendadas(new Date(), { apenas: orgs, pausaMs: 0 });
    await processarWebhooks(new Date(Date.now() + 1000), { apenas: orgs });
    await processarCampanhas(quarta, { apenas: orgs });
  };
  const zero = JSON.stringify({ agendadas: 0, webhooks: 0, campanhas: 0 });
  const um = JSON.stringify({ agendadas: 1, webhooks: 1, campanhas: 1 });

  await db.organizacao.update({ where: { id: orgB.id }, data: { situacao: "SUSPENSA" } });
  await rodada([orgA.id, orgB.id]);
  ok("o relógio envia os da A e não envia nada da B (agendadas, webhooks, campanhas)", JSON.stringify(await situacaoDe(orgA)) === um && JSON.stringify(await situacaoDe(orgB)) === zero && recebidos.join() === "/A");
  ok("a sessão deixa de valer na hora", (await pagina(base, "/api/exportar/clientes.csv", cookieB)).status === 401);
  ok("a agenda some", (await pagina(base, `/api/agenda/${agB}.ics`)).status === 404);
  const antesSuspensa = await retrato(orgB.id);
  const acaoSuspensa = await chamar("clientes.adicionarAtividade", [b.cliente.id, form({ descricao: "x" })], { cookie: cookieB });
  ok("as actions mandam para o login e nada muda", acaoSuspensa.redirecionou === "/login" && diferencas(antesSuspensa, await retrato(orgB.id)).length === 0);
  const loginSuspenso = await chamar("login.entrar", [null, form({ email: adminB.email, senha: SENHA_TESTE })]);
  ok("login com a senha certa explica a suspensão e não cria sessão", /suspenso/.test((loginSuspenso.valor as { erro?: string })?.erro ?? "") && !loginSuspenso.cookies.length);
  // Como se fosse a primeira mensagem da conversa (é quando o chatbot cumprimenta).
  const recebida = { conversa: { ...conversaB!, ultimaTexto: null }, tipo: "TEXTO" as const, conteudo: "oi", criadoEm: new Date() };
  const saidas = () => db.mensagemWhatsapp.count({ where: { conversaId: conversaB!.id, direcao: "SAIDA" } });
  await aoReceberDoCliente(recebida);
  ok("o chatbot não responde", (await saidas()) === 0);
  ok("mas a mensagem recebida continua sendo gravada", (await avisar(zapB!.instancia!, telB, "iso-4")).salvas === 1);

  await db.organizacao.update({ where: { id: orgB.id }, data: { situacao: "EM_TESTE", testeAte: new Date("2026-11-01T12:00:00Z") } });
  await rodada([orgB.id]);
  ok("teste vencido também bloqueia", (await pagina(base, "/api/exportar/clientes.csv", cookieB)).status === 401 && JSON.stringify(await situacaoDe(orgB)) === zero);

  await db.organizacao.update({ where: { id: orgB.id }, data: { situacao: "ATIVA", testeAte: null } });
  ok("ativada, volta a entrar", (await pagina(base, "/api/exportar/clientes.csv", cookieB)).status === 200);
  await rodada([orgB.id]);
  ok("e o relógio volta a enviar (agendada, webhook e campanha)", JSON.stringify(await situacaoDe(orgB)) === um && recebidos.join() === "/A,/B");
  await aoReceberDoCliente(recebida);
  ok("e o chatbot volta a responder", (await saidas()) > 0);
  receptor.close();

  titulo("Link de senha pedido pelo administrador");
  await db.usuario.update({ where: { id: colegaA.id }, data: { ativo: true } });
  const doColega = await ate(() => email.para(colegaA.email).find((m) => m.texto.includes("/senha/nova")), "e-mail do colega");
  ok("foi para o e-mail da própria pessoa, com o APP_URL, e para mais ninguém", codigoDoLink(doColega.texto) && doColega.para.length === 1 && doColega.texto.includes("https://crm.exemplo.test/senha/nova") && email.para(adminA.email).length === 0);

  console.log(`\n${totalPassou()} verificações passaram (${telas.length} telas em cada empresa, ${casos.length + 2} tentativas de gravação entre empresas).`);
} finally {
  await servidor?.desligar();
  await email.fechar();
  await db.$disconnect();
  await banco.apagar();
  console.log("Servidor desligado e banco de teste apagado.");
}
