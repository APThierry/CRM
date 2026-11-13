// Dados de exemplo para desenvolvimento.
// Rodar: npx prisma db seed
//
// Os cursos são os do site da Brigada MG. Carga horária e validade são
// valores de referência e precisam ser conferidos com a Brigada.
// Os clientes, contatos e negócios são FICTÍCIOS.
import "dotenv/config";
import { ETIQUETAS_PADRAO, RESPOSTAS_PADRAO } from "../src/lib/padroes-atendimento";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Cliente, type Contato, type EtapaFunil, type Servico } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const diasAPartirDeHoje = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(8, 0, 0, 0);
  return d;
};

async function main() {
  // Apaga a organização de exemplo, se já existir, para poder rodar de novo.
  const existente = await db.organizacao.findUnique({ where: { slug: "brigada-mg" } });
  if (existente) {
    const where = { organizacaoId: existente.id };
    await db.turma.deleteMany({ where });
    await db.negocio.deleteMany({ where });
    await db.organizacao.delete({ where: { id: existente.id } });
  }

  const org = await db.organizacao.create({
    data: {
      nome: "Brigada MG",
      slug: "brigada-mg",
      telefone: "(31) 3157-8131",
      email: "brigadamgincendio@gmail.com",
    },
  });
  const organizacaoId = org.id;

  // Usuários de exemplo. O login entra na Fase 2, por isso a senha ainda não existe.
  const [admin, vendedora, instrutor] = await Promise.all(
    [
      { nome: "Administrador", email: "admin@brigadamg.local", papel: "ADMIN" as const },
      { nome: "Ana (Comercial)", email: "comercial@brigadamg.local", papel: "VENDEDOR" as const },
      { nome: "Carlos (Instrutor)", email: "instrutor@brigadamg.local", papel: "INSTRUTOR" as const },
    ].map((u) => db.usuario.create({ data: { ...u, organizacaoId, senhaHash: "definir-na-fase-2" } })),
  );

  // Etapas do funil de vendas.
  const etapasDados = [
    { nome: "Novo contato", cor: "#64748b" },
    { nome: "Qualificação", cor: "#0ea5e9" },
    { nome: "Visita técnica", cor: "#8b5cf6" },
    { nome: "Proposta enviada", cor: "#f59e0b" },
    { nome: "Negociação", cor: "#f97316" },
    { nome: "Fechado", cor: "#16a34a", tipo: "GANHO" as const },
    { nome: "Perdido", cor: "#dc2626", tipo: "PERDIDO" as const },
  ];
  const etapas: EtapaFunil[] = [];
  for (const [ordem, e] of etapasDados.entries()) {
    etapas.push(await db.etapaFunil.create({ data: { ...e, ordem, organizacaoId } }));
  }
  const etapa = (nome: string) => etapas.find((e) => e.nome === nome)!;

  // Cursos do site da Brigada MG.
  const cursosDados = [
    { nome: "Bombeiro Civil / Brigadista Profissional", cargaHoraria: 210, validadeMeses: 12 },
    { nome: "NR 23 / IT 12 - Proteção Contra Incêndios (Brigada)", cargaHoraria: 16, validadeMeses: 12 },
    { nome: "NR 33 - Segurança em Espaços Confinados", cargaHoraria: 16, validadeMeses: 12 },
    { nome: "NR 35 - Trabalho em Altura", cargaHoraria: 8, validadeMeses: 24 },
    { nome: "NR 10 - Segurança em Eletricidade", cargaHoraria: 40, validadeMeses: 24 },
    { nome: "Lei Lucas 13.722/18 - Primeiros Socorros em Escolas", cargaHoraria: 8, validadeMeses: 12 },
    { nome: "NR 7 - Primeiros Socorros", cargaHoraria: 8, validadeMeses: 12 },
    { nome: "NR 5 - CIPA", cargaHoraria: 20, validadeMeses: 12 },
    { nome: "Brigada Florestal", cargaHoraria: 40, validadeMeses: 12 },
  ];
  const cursos: Servico[] = [];
  for (const c of cursosDados) {
    cursos.push(await db.servico.create({ data: { ...c, organizacaoId } }));
  }
  const curso = (prefixo: string) => cursos.find((c) => c.nome.startsWith(prefixo))!;

  // Clientes fictícios.
  const clientesDados = [
    {
      nome: "Metalúrgica Horizonte Ltda",
      segmento: "Indústria",
      cidade: "Contagem",
      origem: "Indicação",
      whatsapp: "5531990000001",
      contato: { nome: "Roberto Lima", cargo: "Técnico de Segurança do Trabalho" },
    },
    {
      nome: "Condomínio Residencial Serra Verde",
      segmento: "Condomínio",
      cidade: "Belo Horizonte",
      origem: "Google",
      whatsapp: "5531990000002",
      contato: { nome: "Patrícia Souza", cargo: "Síndica" },
    },
    {
      nome: "Colégio Pequenos Passos",
      segmento: "Escola",
      cidade: "Belo Horizonte",
      origem: "Instagram",
      whatsapp: "5531990000003",
      contato: { nome: "Marcos Andrade", cargo: "Diretor" },
    },
    {
      nome: "Construtora Alicerce",
      segmento: "Construção civil",
      cidade: "Betim",
      origem: "Site",
      whatsapp: "5531990000004",
      contato: { nome: "Juliana Reis", cargo: "Engenheira de Segurança" },
    },
    {
      nome: "Supermercado Bom Preço",
      segmento: "Varejo",
      cidade: "Nova Lima",
      origem: "Indicação",
      whatsapp: "5531990000005",
      contato: { nome: "Fernando Costa", cargo: "Gerente" },
    },
    {
      nome: "Hospital Santa Clara",
      segmento: "Saúde",
      cidade: "Belo Horizonte",
      origem: "Ligação",
      whatsapp: "5531990000006",
      contato: { nome: "Dra. Lúcia Martins", cargo: "Coordenadora SESMT" },
    },
  ];
  const clientes: (Cliente & { contatos: Contato[] })[] = [];
  for (const { contato, ...c } of clientesDados) {
    const cliente = await db.cliente.create({
      data: {
        ...c,
        uf: "MG",
        organizacaoId,
        responsavelId: vendedora.id,
        contatos: {
          create: { ...contato, whatsapp: c.whatsapp, principal: true, organizacaoId },
        },
      },
      include: { contatos: true },
    });
    clientes.push(cliente);
  }
  const cliente = (prefixo: string) => clientes.find((c) => c.nome.startsWith(prefixo))!;

  // Negócios em várias etapas do funil.
  const negociosDados = [
    { titulo: "Brigada de incêndio - 30 funcionários", cli: "Metalúrgica", cur: "NR 23", etapa: "Proposta enviada", valor: 5400, alunos: 30 },
    { titulo: "NR 33 - equipe de manutenção", cli: "Metalúrgica", cur: "NR 33", etapa: "Qualificação", valor: 3200, alunos: 8 },
    { titulo: "Brigada do condomínio", cli: "Condomínio", cur: "NR 23", etapa: "Visita técnica", valor: 1800, alunos: 10 },
    { titulo: "Lei Lucas - professores", cli: "Colégio", cur: "Lei Lucas", etapa: "Negociação", valor: 2500, alunos: 25 },
    { titulo: "NR 35 - obra Betim", cli: "Construtora", cur: "NR 35", etapa: "Novo contato", valor: 4000, alunos: 40 },
    { titulo: "Brigada - loja Nova Lima", cli: "Supermercado", cur: "NR 23", etapa: "Fechado", valor: 2700, alunos: 15 },
    { titulo: "Primeiros socorros - enfermagem", cli: "Hospital", cur: "NR 7", etapa: "Perdido", valor: 3600, alunos: 20, motivoPerda: "Fechou com concorrente" },
  ];
  for (const n of negociosDados) {
    const cli = cliente(n.cli);
    await db.negocio.create({
      data: {
        organizacaoId,
        titulo: n.titulo,
        clienteId: cli.id,
        contatoId: cli.contatos[0].id,
        servicoId: curso(n.cur).id,
        etapaId: etapa(n.etapa).id,
        responsavelId: vendedora.id,
        valor: n.valor,
        quantidadeAlunos: n.alunos,
        previsaoFechamento: diasAPartirDeHoje(15),
        motivoPerda: n.motivoPerda,
        fechadoEm: ["Fechado", "Perdido"].includes(n.etapa) ? diasAPartirDeHoje(-3) : null,
      },
    });
  }

  // Turma realizada há quase 1 ano: os certificados vencem em breve (reciclagem!).
  const nr23 = curso("NR 23");
  const turmaAntiga = await db.turma.create({
    data: {
      organizacaoId,
      servicoId: nr23.id,
      clienteId: cliente("Supermercado").id,
      instrutorId: instrutor.id,
      dataInicio: diasAPartirDeHoje(-330),
      dataFim: diasAPartirDeHoje(-329),
      local: "Supermercado Bom Preço - Nova Lima",
      vagas: 15,
      status: "REALIZADA",
    },
  });
  const validade = diasAPartirDeHoje(-329 + 365);
  // Mesmo formato gerado pelo sistema: prefixo da organização, ano e sequência.
  const anoTurma = turmaAntiga.dataFim!.getFullYear();
  for (const [i, nome] of ["João Pereira", "Maria Oliveira", "Pedro Santos", "Luana Rocha"].entries()) {
    const p = await db.participante.create({
      data: { organizacaoId, nome, clienteId: cliente("Supermercado").id },
    });
    await db.matricula.create({
      data: {
        turmaId: turmaAntiga.id,
        participanteId: p.id,
        presente: true,
        aprovado: true,
        certificadoNumero: `BM-${anoTurma}-${String(i + 1).padStart(4, "0")}`,
        emitidoEm: turmaAntiga.dataFim,
        validadeAte: validade,
      },
    });
  }

  // Próximas turmas.
  await db.turma.create({
    data: {
      organizacaoId,
      servicoId: nr23.id,
      instrutorId: instrutor.id,
      dataInicio: diasAPartirDeHoje(7),
      dataFim: diasAPartirDeHoje(8),
      local: "Centro de Treinamento Brigada MG",
      vagas: 25,
      status: "CONFIRMADA",
    },
  });
  await db.turma.create({
    data: {
      organizacaoId,
      servicoId: curso("NR 35").id,
      modalidade: "HIBRIDO",
      instrutorId: instrutor.id,
      dataInicio: diasAPartirDeHoje(14),
      local: "EAD + prática no Centro de Treinamento",
      vagas: 20,
      status: "PLANEJADA",
    },
  });

  // Algumas atividades e tarefas.
  await db.atividade.createMany({
    data: [
      { organizacaoId, tipo: "LIGACAO", descricao: "Roberto pediu proposta para 30 pessoas, turno da manhã.", clienteId: cliente("Metalúrgica").id, usuarioId: vendedora.id },
      { organizacaoId, tipo: "TAREFA", descricao: "Cobrar retorno da proposta de brigada", clienteId: cliente("Metalúrgica").id, usuarioId: vendedora.id, agendadaPara: diasAPartirDeHoje(2) },
      { organizacaoId, tipo: "VISITA", descricao: "Agendar visita técnica no condomínio", clienteId: cliente("Condomínio").id, usuarioId: vendedora.id, agendadaPara: diasAPartirDeHoje(1) },
      { organizacaoId, tipo: "NOTA", descricao: "Certificados da brigada vencem no próximo mês. Oferecer reciclagem.", clienteId: cliente("Supermercado").id, usuarioId: admin.id },
    ],
  });

  // Central de atendimento: etiquetas e respostas rápidas para começar.
  await db.etiqueta.createMany({ data: ETIQUETAS_PADRAO.map((e) => ({ ...e, organizacaoId })) });
  await db.respostaRapida.createMany({ data: RESPOSTAS_PADRAO.map((r) => ({ ...r, organizacaoId })) });

  console.log(`Seed concluído: ${clientes.length} clientes, ${cursos.length} cursos, ${negociosDados.length} negócios.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
