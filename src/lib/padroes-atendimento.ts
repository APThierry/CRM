// Etiquetas e respostas rápidas que toda organização nova recebe.
// Usado pelo seed (prisma/seed.ts) e pelo script scripts/padroes-atendimento.mts.
// Pode editar à vontade: depois cada empresa ajusta na tela "Respostas e etiquetas".

export const ETIQUETAS_PADRAO = [
  { nome: "Orçamento", cor: "#2563eb" },
  { nome: "Proposta enviada", cor: "#7c3aed" },
  { nome: "Reciclagem", cor: "#ca8a04" },
  { nome: "Fechado", cor: "#16a34a" },
  { nome: "Urgente", cor: "#dc2626" },
];

export const RESPOSTAS_PADRAO = [
  {
    atalho: "ola",
    texto: "Olá {primeiro_nome}! Aqui é {atendente}, da Brigada MG. Como posso ajudar?",
  },
  {
    atalho: "orcamento",
    texto:
      "Para montar o orçamento, me passe por favor:\n1. Qual treinamento (ex.: Brigada NR 23, NR 35, Primeiros Socorros)\n2. Quantas pessoas\n3. Cidade e se prefere na sua empresa ou no nosso centro\n4. Data desejada",
  },
  {
    atalho: "reciclagem",
    texto:
      "Olá {primeiro_nome}! Os certificados da sua equipe estão perto de vencer. Vamos agendar a reciclagem para manter tudo em dia com a fiscalização?",
  },
  {
    atalho: "obrigado",
    texto: "Obrigado pelo contato, {primeiro_nome}! Qualquer dúvida é só chamar aqui. 🧯",
  },
];
