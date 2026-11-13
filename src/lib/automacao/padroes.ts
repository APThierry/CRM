// Textos iniciais da automação. Cada empresa ajusta na tela Automação.
import { HORARIOS_PADRAO } from "./horario";

export const AUTOMACAO_PADRAO = {
  horarios: HORARIOS_PADRAO,
  mensagemForaHorario:
    "Olá{, primeiro_nome}! Recebemos sua mensagem. 🙂\nNosso atendimento funciona {horario}. Assim que voltarmos, respondemos por aqui.",
  botBoasVindas: "Olá{, primeiro_nome}! 👋 Bem-vindo(a) à {empresa}.\nPara agilizar seu atendimento, responda com o *número* da opção:",
  botReativarHoras: 24,
};

/** Opções do menu. `etiqueta` é procurada pelo nome nas etiquetas da empresa. */
export const OPCOES_BOT_PADRAO = [
  {
    rotulo: "Orçamento de treinamento",
    resposta: "Ótimo! Já vou te passar para um atendente. Para adiantar, conte: qual treinamento, quantas pessoas e em qual cidade?",
    etiqueta: "Orçamento",
  },
  {
    rotulo: "Reciclagem / renovar certificados",
    resposta: "Certo! Me diga o nome da empresa e o treinamento que precisa renovar, que um atendente já continua com você.",
    etiqueta: "Reciclagem",
  },
  {
    rotulo: "Certificados e segunda via",
    resposta: "Me envie o nome completo e o CPF do aluno, por favor. Um atendente vai localizar o certificado.",
    etiqueta: null,
  },
  { rotulo: "Falar com um atendente", resposta: "Já te passo para um atendente. Só um instante! 🙂", etiqueta: null },
];

export const BOT_NAO_ENTENDI = "Não entendi 🙂 Responda só com o *número* da opção:";
export const BOT_DESISTIU = "Tudo bem! Um atendente vai continuar com você em instantes.";
