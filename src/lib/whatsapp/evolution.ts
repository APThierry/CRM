import "server-only";
// Cliente da Evolution API (WhatsApp). Documentação: docs/WHATSAPP.md
//
// Toda conversa com o WhatsApp passa por aqui. Se um dia trocarmos para a API
// oficial da Meta, só este arquivo precisa mudar.
//
// Os erros que chegam à tela são frases prontas: endereço, chave e resposta da
// Evolution API ficam só no terminal do servidor.
import { LIMITES } from "@/lib/ambiente";
import type { Passe } from "./cota";

const URL_API = process.env.EVOLUTION_API_URL ?? "http://localhost:8080";
const CHAVE = process.env.EVOLUTION_API_KEY ?? "";
// Cada empresa tem a própria instância (um número de WhatsApp). O nome fica em
// ConfiguracaoWhatsapp.instancia; quem chama descobre com instanciaDaEmpresa()
// (src/lib/whatsapp/instancia.ts) e passa aqui.
const caminhoInstancia = (instancia: string) => encodeURIComponent(instancia);

/** Consultas rápidas (estado da conexão): uma instância travada não segura as outras. */
const TEMPO_CURTO = 5_000;
const TEMPO_TEXTO = 20_000;
const TEMPO_MIDIA = 60_000; // mídia pode demorar para subir

export type EstadoConexao = "open" | "connecting" | "close" | "inexistente" | "erro";

export class ErroWhatsapp extends Error {
  /** Código HTTP da Evolution API, quando ela respondeu. */
  status?: number;
  /** Não dá para saber se a mensagem saiu (demorou demais ou a conexão caiu no meio). */
  talvezEnviado = false;

  constructor(mensagem: string, { status, talvezEnviado = false }: { status?: number; talvezEnviado?: boolean } = {}) {
    super(mensagem);
    this.status = status;
    this.talvezEnviado = talvezEnviado;
  }
}

/**
 * Modo simulação (WHATSAPP_SIMULAR_ENVIO=1 no .env): nada sai para o WhatsApp.
 * As mensagens são gravadas no CRM como se tivessem ido. Serve para testar
 * chatbot, agendamentos e campanhas sem mandar mensagem para ninguém.
 */
export const simulandoEnvio = () => process.env.WHATSAPP_SIMULAR_ENVIO === "1";

/** Envia de verdade, ou só finge (modo simulação). */
async function enviar(caminho: string, corpo: Record<string, unknown>, tempoMs: number) {
  if (simulandoEnvio()) {
    console.log(`[whatsapp simulado] ${caminho} para ${String(corpo.number)}`);
    return { idExterno: `simulado-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
  const r = await chamar<{ key?: { id?: string } }>("POST", caminho, corpo, tempoMs);
  return { idExterno: r.key?.id ?? null };
}

/** Frase para a tela. O detalhe da Evolution API vai só para o terminal. */
function mensagemDoErro(status: number, detalhe: unknown) {
  const semWhatsapp = Array.isArray(detalhe) && detalhe.some((d) => (d as { exists?: unknown } | null)?.exists === false);
  if (semWhatsapp) return "Este número não tem WhatsApp.";
  if (status === 404) return "O WhatsApp da empresa não está conectado.";
  if (status >= 500) return "O serviço de WhatsApp está com problema. Tente de novo em alguns minutos.";
  return `O serviço de WhatsApp recusou o pedido (código ${status}).`;
}

async function chamar<T>(metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown, tempoMs = TEMPO_MIDIA): Promise<T> {
  let resposta: Response;
  let texto: string;
  try {
    resposta = await fetch(`${URL_API}${caminho}`, {
      method: metodo,
      headers: { apikey: CHAVE, "Content-Type": "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: "no-store",
      redirect: "error", // a chave da API nunca vai para outro endereço
      signal: AbortSignal.timeout(tempoMs),
    });
    texto = await resposta.text();
  } catch (e) {
    const causa = (e as { cause?: { code?: string } })?.cause?.code;
    console.error(`[whatsapp] a Evolution API não respondeu (${causa ?? (e instanceof Error ? e.name : "erro")})`);
    // Recusou a conexão: com certeza não saiu. Qualquer outra coisa: pode ter saído.
    const naoSaiu = ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"].includes(causa ?? "");
    throw new ErroWhatsapp("O serviço de WhatsApp não respondeu. Tente de novo em instantes.", { talvezEnviado: !naoSaiu });
  }
  let dados: { response?: { message?: unknown }; message?: unknown } | null = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    // resposta que não é JSON (ex.: página de erro de um proxy)
  }
  if (!resposta.ok) {
    const detalhe = dados?.response?.message ?? dados?.message ?? resposta.statusText;
    if (resposta.status !== 404) console.error(`[whatsapp] a Evolution API respondeu ${resposta.status}: ${JSON.stringify(detalhe)?.slice(0, 300)}`);
    throw new ErroWhatsapp(mensagemDoErro(resposta.status, detalhe), { status: resposta.status, talvezEnviado: resposta.status >= 500 });
  }
  return dados as T;
}

/** Configuração do webhook: para onde a Evolution API manda as mensagens recebidas. */
function configuracaoWebhook() {
  return {
    enabled: true,
    url: process.env.WHATSAPP_WEBHOOK_URL ?? "http://localhost:3000/api/whatsapp/webhook",
    headers: { "x-crm-segredo": process.env.WHATSAPP_WEBHOOK_SEGREDO ?? "" },
    byEvents: false,
    // Fotos, áudios, vídeos e documentos chegam junto com a mensagem.
    base64: true,
    // MESSAGES_UPDATE = avisos de entregue e lida (status das campanhas).
    events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"],
  };
}

type Instancia = { name: string; connectionStatus: string; ownerJid?: string | null; profileName?: string | null };

export async function buscarInstancia(instancia: string): Promise<Instancia | null> {
  const lista = await chamar<Instancia[]>("GET", `/instance/fetchInstances?instanceName=${caminhoInstancia(instancia)}`, undefined, TEMPO_CURTO).catch((e) => {
    // A Evolution API responde 404 quando a instância não existe.
    if (e instanceof ErroWhatsapp && e.status === 404) return [];
    throw e;
  });
  return lista.find((i) => i.name === instancia) ?? null;
}

// Uma criação por vez: duas empresas conectando juntas não passam do teto.
const guardado = globalThis as unknown as { criandoInstanciaCrm?: Promise<unknown> };

/** Cria a instância (se ainda não existir e couber no servidor) e garante que o webhook está configurado. */
export async function garantirInstancia(instancia: string) {
  const anterior = guardado.criandoInstanciaCrm ?? Promise.resolve();
  const tarefa = anterior.catch(() => {}).then(async () => {
    if (await buscarInstancia(instancia)) {
      await chamar("POST", `/webhook/set/${caminhoInstancia(instancia)}`, { webhook: configuracaoWebhook() });
      return;
    }
    // Conta as instâncias que existem DE VERDADE na Evolution API (cada uma pesa na memória da VPS).
    const todas = await chamar<Instancia[]>("GET", "/instance/fetchInstances", undefined, TEMPO_CURTO).catch((e) => {
      if (e instanceof ErroWhatsapp && e.status === 404) return [];
      throw e;
    });
    if (todas.length >= LIMITES.instanciasWhatsapp()) {
      console.warn(`[whatsapp] teto de instâncias atingido (${todas.length}): "${instancia}" não foi criada`);
      throw new ErroWhatsapp("O servidor atingiu o limite de números de WhatsApp. Fale com o suporte do CRM.");
    }
    await chamar("POST", "/instance/create", {
      instanceName: instancia,
      integration: "WHATSAPP-BAILEYS",
      qrcode: false,
      webhook: configuracaoWebhook(),
    });
  });
  guardado.criandoInstanciaCrm = tarefa;
  await tarefa;
}

/** Atualiza o webhook da instância, se ela já existir (sem criar nada). */
export async function garantirWebhook(instancia: string) {
  if (simulandoEnvio() || !CHAVE) return;
  if (!(await buscarInstancia(instancia))) return;
  await chamar("POST", `/webhook/set/${caminhoInstancia(instancia)}`, { webhook: configuracaoWebhook() }, TEMPO_CURTO);
}

export async function estadoConexao(instancia: string): Promise<{ estado: EstadoConexao; numero?: string; nome?: string }> {
  try {
    const dados = await buscarInstancia(instancia);
    if (!dados) return { estado: "inexistente" };
    const { instance } = await chamar<{ instance: { state: EstadoConexao } }>("GET", `/instance/connectionState/${caminhoInstancia(instancia)}`, undefined, TEMPO_CURTO);
    return {
      estado: instance.state,
      numero: dados.ownerJid?.split("@")[0],
      nome: dados.profileName ?? undefined,
    };
  } catch {
    return { estado: "erro" };
  }
}

/** Pede um QR Code para conectar o celular. Retorna a imagem em base64 (data URL). */
export async function gerarQrCode(instancia: string) {
  await garantirInstancia(instancia);
  const r = await chamar<{ base64?: string; pairingCode?: string | null }>("GET", `/instance/connect/${caminhoInstancia(instancia)}`);
  return r.base64 ?? null;
}

export async function desconectar(instancia: string) {
  await chamar("DELETE", `/instance/logout/${caminhoInstancia(instancia)}`);
}

// --- Envios: só com o passe de src/lib/whatsapp/cota.ts ------------------------------

/** Envia uma mensagem de texto. `numero` só com dígitos e DDI, ex.: 5531988887777. */
export async function enviarTexto(passe: Passe, numero: string, texto: string) {
  return enviar(`/message/sendText/${caminhoInstancia(passe.instancia)}`, { number: numero, text: texto }, TEMPO_TEXTO);
}

export type TipoMidia = "image" | "video" | "document";

/** Envia foto, vídeo ou documento. `base64` sem o prefixo "data:". */
export async function enviarMidia(
  passe: Passe,
  numero: string,
  midia: { tipo: TipoMidia; base64: string; mimetype: string; nomeArquivo?: string; legenda?: string },
) {
  return enviar(
    `/message/sendMedia/${caminhoInstancia(passe.instancia)}`,
    {
      number: numero,
      mediatype: midia.tipo,
      mimetype: midia.mimetype,
      media: midia.base64,
      fileName: midia.nomeArquivo,
      caption: midia.legenda || undefined,
    },
    TEMPO_MIDIA,
  );
}

/** Envia áudio como mensagem de voz (aparece como se tivesse sido gravado na hora). */
export async function enviarAudio(passe: Passe, numero: string, base64: string) {
  return enviar(`/message/sendWhatsAppAudio/${caminhoInstancia(passe.instancia)}`, { number: numero, audio: base64 }, TEMPO_MIDIA);
}
