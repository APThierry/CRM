import "server-only";
// O que o CRM faz sozinho quando chega mensagem de um cliente:
//
// 1. Cancela os follow-ups agendados da conversa ("cancelar se o cliente responder").
//    Campanhas: marca "respondeu"; se a mensagem for SAIR, descadastra e para aqui.
// 2. Fora do horário de atendimento: manda o aviso (no máximo 1 vez a cada 12 horas).
// 3. Chatbot: em conversa nova (ou parada há tempo) e sem atendente, manda o menu.
//    Quando o cliente escolhe uma opção, responde, coloca a etiqueta e, se a opção
//    tiver atendente, passa a conversa para ele.
//
// Chamado pelo webhook depois de gravar a mensagem (src/app/api/whatsapp/webhook).
// Erros aqui nunca derrubam o recebimento: só aparecem no terminal.
import type { Conversa, TipoMensagem } from "@/generated/prisma/client";
import { preencherVariaveis } from "@/lib/atendimento";
import { aoResponderCampanha } from "@/lib/campanhas/status";
import { db } from "@/lib/db";
import { enviarAutomatico } from "@/lib/whatsapp/enviar";
import { lerAutomacao, textoDoMenu } from "./config";
import { descreverHorarios, estaAberto } from "./horario";
import { BOT_DESISTIU, BOT_NAO_ENTENDI } from "./padroes";

const HORA = 3_600_000;
/** Mensagens mais antigas que isso (ex.: histórico sincronizado) não disparam nada. */
const ATRASO_MAXIMO = 10 * 60_000;
const INTERVALO_AVISO_FORA_HORARIO = 12 * HORA;

type Recebida = {
  /** A conversa como estava ANTES desta mensagem. */
  conversa: Pick<Conversa, "id" | "organizacaoId" | "telefone" | "ultimaEm" | "ultimaTexto">;
  tipo: TipoMensagem;
  conteudo: string;
  criadoEm: Date;
};

export async function aoReceberDoCliente(m: Recebida) {
  const { organizacaoId, id } = m.conversa;

  const canceladas = await db.mensagemAgendada.updateMany({
    where: { conversaId: id, status: "PENDENTE", cancelarSeResponder: true },
    data: { status: "CANCELADA", motivo: "o cliente respondeu" },
  });
  if (canceladas.count) console.log(`[automação] ${canceladas.count} follow-up(s) cancelado(s): o cliente respondeu`);

  const agora = new Date();
  if (agora.getTime() - m.criadoEm.getTime() > ATRASO_MAXIMO) return;

  // Campanhas: marca "respondeu" e trata o SAIR (descadastro). Quem saiu não recebe o chatbot.
  const saiu = await aoResponderCampanha({ organizacaoId, telefone: m.conversa.telefone, conteudo: m.conteudo, tipo: m.tipo });
  if (saiu) return;

  const config = await lerAutomacao(organizacaoId);
  if (!config || (!config.horarioAtivo && !config.botAtivo)) return;

  const conversa = await db.conversa.findUnique({
    where: { id },
    include: { contato: { select: { nome: true } }, cliente: { select: { nome: true } }, organizacao: { select: { nome: true } } },
  });
  if (!conversa) return;
  const variaveis = {
    nome: conversa.contato?.nome ?? conversa.nome ?? conversa.cliente?.nome,
    empresa: conversa.organizacao.nome,
    horario: descreverHorarios(config.horarios),
  };
  const enviar = (texto: string) => enviarAutomatico(conversa, preencherVariaveis(texto, variaveis));

  // --- Fora do horário -------------------------------------------------------
  if (config.horarioAtivo && !estaAberto(config.horarios, agora)) {
    // Marca antes de enviar: se chegarem 3 mensagens juntas, só a primeira gera aviso.
    const limite = new Date(agora.getTime() - INTERVALO_AVISO_FORA_HORARIO);
    const marcou = await db.conversa.updateMany({
      where: { id, OR: [{ foraHorarioEm: null }, { foraHorarioEm: { lt: limite } }] },
      data: { foraHorarioEm: agora },
    });
    if (marcou.count && config.mensagemForaHorario.trim()) await enviar(config.mensagemForaHorario);
  }

  // --- Chatbot ---------------------------------------------------------------
  if (!config.botAtivo) return;
  const opcoes = await db.opcaoBot.findMany({ where: { organizacaoId }, orderBy: { ordem: "asc" } });
  if (opcoes.length === 0) return;
  const menu = (cabecalho: string) => textoDoMenu(cabecalho, opcoes);

  if (conversa.botEtapa === "MENU") {
    const resposta = m.tipo === "TEXTO" ? m.conteudo.trim().toLowerCase() : "";
    const numero = resposta.match(/^\d+/)?.[0];
    const escolhida = opcoes.find(
      (o) => (numero && o.ordem === Number(numero)) || (resposta.length >= 3 && o.rotulo.toLowerCase().startsWith(resposta)),
    );
    if (escolhida) {
      if (escolhida.resposta?.trim()) await enviar(escolhida.resposta);
      await db.conversa.update({
        where: { id },
        data: {
          botEtapa: null,
          botTentativas: 0,
          ...(escolhida.atendenteId && !conversa.atendenteId ? { atendenteId: escolhida.atendenteId } : {}),
          ...(escolhida.etiquetaId ? { etiquetas: { connect: { id: escolhida.etiquetaId } } } : {}),
        },
      });
    } else if (conversa.botTentativas >= 1) {
      await enviar(BOT_DESISTIU);
      await db.conversa.update({ where: { id }, data: { botEtapa: null, botTentativas: 0 } });
    } else {
      await enviar(menu(BOT_NAO_ENTENDI));
      await db.conversa.update({ where: { id }, data: { botTentativas: { increment: 1 } } });
    }
    return;
  }

  // Só conversas na fila; e só se for a primeira mensagem ou se estava parada.
  const nova = m.conversa.ultimaTexto === null;
  const parada = m.criadoEm.getTime() - m.conversa.ultimaEm.getTime() >= config.botReativarHoras * HORA;
  if (!conversa.atendenteId && !conversa.botEtapa && (nova || parada)) {
    const marcou = await db.conversa.updateMany({
      where: { id, botEtapa: null, atendenteId: null },
      data: { botEtapa: "MENU", botTentativas: 0 },
    });
    if (marcou.count) await enviar(menu(config.botBoasVindas));
  }
}
