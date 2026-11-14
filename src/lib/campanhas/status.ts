import "server-only";
// Status das mensagens de campanha (entregue, lida, respondeu) e descadastro (SAIR).
import { db } from "@/lib/db";
import { chaveTelefone } from "@/lib/formatar";
import { enviarAutomatico } from "@/lib/whatsapp/enviar";
import { dispararEvento } from "@/lib/webhooks/disparar";
import { CONFIRMACAO_SAIR, querSair } from "./ritmo";

/** Como a Evolution API 2.3 manda o evento messages.update. */
type AvisoStatus = { keyId?: string; fromMe?: boolean; status?: string };

/**
 * "DELIVERY_ACK" = entregue no celular; "READ"/"PLAYED" = lida (ou áudio ouvido).
 * Só mensagens nossas (fromMe) que saíram por uma campanha.
 */
export async function registrarStatus(dados: unknown) {
  const avisos = (Array.isArray(dados) ? dados : [dados]) as AvisoStatus[];
  let atualizadas = 0;
  for (const a of avisos) {
    if (!a?.keyId || a.fromMe === false) continue;
    const agora = new Date();
    const lida = a.status === "READ" || a.status === "PLAYED";
    const entregue = lida || a.status === "DELIVERY_ACK";
    if (!entregue) continue;
    // Quem leu também recebeu: preenche os dois (sem apagar uma data que já existe).
    const r1 = await db.destinatarioCampanha.updateMany({
      where: { idExterno: a.keyId, entregueEm: null },
      data: { entregueEm: agora },
    });
    const r2 = lida
      ? await db.destinatarioCampanha.updateMany({ where: { idExterno: a.keyId, lidaEm: null }, data: { lidaEm: agora } })
      : { count: 0 };
    atualizadas += r1.count + r2.count;
  }
  return atualizadas;
}

/** Janela em que uma resposta do cliente conta como "respondeu à campanha". */
const JANELA_RESPOSTA = 7 * 86_400_000;

/**
 * Chamado quando chega mensagem do cliente (src/lib/automacao/ao-receber.ts).
 * Marca "respondeu" na campanha mais recente para aquele número e, se a
 * mensagem for SAIR, descadastra e confirma. Retorna true se descadastrou
 * (aí o chatbot não deve responder).
 */
export async function aoResponderCampanha(m: { organizacaoId: string; telefone: string; conteudo: string; tipo: string }) {
  const chave = chaveTelefone(m.telefone);
  if (!chave) return false;
  const agora = new Date();

  const recente = await db.destinatarioCampanha.findFirst({
    where: {
      chave,
      status: "ENVIADA",
      respondeuEm: null,
      enviadaEm: { gte: new Date(agora.getTime() - JANELA_RESPOSTA) },
      campanha: { organizacaoId: m.organizacaoId },
    },
    orderBy: { enviadaEm: "desc" },
    select: { id: true },
  });
  if (recente) await db.destinatarioCampanha.update({ where: { id: recente.id }, data: { respondeuEm: agora } });

  if (m.tipo !== "TEXTO" || !querSair(m.conteudo)) return false;

  const ja = await db.descadastro.findUnique({ where: { organizacaoId_chave: { organizacaoId: m.organizacaoId, chave } } });
  if (!ja) {
    const d = await db.descadastro.create({ data: { organizacaoId: m.organizacaoId, chave, telefone: m.telefone, origem: "respondeu SAIR" } });
    await dispararEvento(m.organizacaoId, "contato.descadastrou", { telefone: d.telefone, origem: d.origem, criadoEm: d.criadoEm.toISOString() });
  }
  // Tira o número das campanhas que ainda não chegaram nele.
  await db.destinatarioCampanha.updateMany({
    where: { chave, status: "PENDENTE", campanha: { organizacaoId: m.organizacaoId } },
    data: { status: "IGNORADA", motivo: "pediu para sair" },
  });
  if (!ja) await enviarAutomatico({ organizacaoId: m.organizacaoId, telefone: m.telefone }, CONFIRMACAO_SAIR);
  console.log(`[campanhas] ${m.telefone} pediu para sair das campanhas`);
  return true;
}
