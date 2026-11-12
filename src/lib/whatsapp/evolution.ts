import "server-only";
// Cliente da Evolution API (WhatsApp). Documentação: docs/WHATSAPP.md
//
// Toda conversa com o WhatsApp passa por aqui. Se um dia trocarmos para a API
// oficial da Meta, só este arquivo precisa mudar.

const URL_API = process.env.EVOLUTION_API_URL ?? "http://localhost:8080";
const CHAVE = process.env.EVOLUTION_API_KEY ?? "";
export const INSTANCIA = process.env.EVOLUTION_INSTANCIA ?? "crm";

export type EstadoConexao = "open" | "connecting" | "close" | "inexistente" | "erro";

export class ErroWhatsapp extends Error {}

async function chamar<T>(metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${URL_API}${caminho}`, {
      method: metodo,
      headers: { apikey: CHAVE, "Content-Type": "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ErroWhatsapp(`Não foi possível falar com a Evolution API em ${URL_API}. Ela está ligada?`);
  }
  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) {
    const detalhe = dados?.response?.message ?? dados?.message ?? resposta.statusText;
    throw new ErroWhatsapp(`Evolution API respondeu ${resposta.status}: ${JSON.stringify(detalhe)}`);
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
    base64: false,
    events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
  };
}

type Instancia = { name: string; connectionStatus: string; ownerJid?: string | null; profileName?: string | null };

export async function buscarInstancia(): Promise<Instancia | null> {
  const lista = await chamar<Instancia[]>("GET", `/instance/fetchInstances?instanceName=${encodeURIComponent(INSTANCIA)}`).catch(
    (e) => {
      // A Evolution API responde 404 quando a instância não existe.
      if (e instanceof ErroWhatsapp && e.message.includes(" 404")) return [];
      throw e;
    },
  );
  return lista.find((i) => i.name === INSTANCIA) ?? null;
}

/** Cria a instância (se ainda não existir) e garante que o webhook está configurado. */
export async function garantirInstancia() {
  const existente = await buscarInstancia();
  if (!existente) {
    await chamar("POST", "/instance/create", {
      instanceName: INSTANCIA,
      integration: "WHATSAPP-BAILEYS",
      qrcode: false,
      webhook: configuracaoWebhook(),
    });
  } else {
    await chamar("POST", `/webhook/set/${INSTANCIA}`, { webhook: configuracaoWebhook() });
  }
}

export async function estadoConexao(): Promise<{ estado: EstadoConexao; numero?: string; nome?: string }> {
  try {
    const instancia = await buscarInstancia();
    if (!instancia) return { estado: "inexistente" };
    const { instance } = await chamar<{ instance: { state: EstadoConexao } }>("GET", `/instance/connectionState/${INSTANCIA}`);
    return {
      estado: instance.state,
      numero: instancia.ownerJid?.split("@")[0],
      nome: instancia.profileName ?? undefined,
    };
  } catch {
    return { estado: "erro" };
  }
}

/** Pede um QR Code para conectar o celular. Retorna a imagem em base64 (data URL). */
export async function gerarQrCode() {
  await garantirInstancia();
  const r = await chamar<{ base64?: string; pairingCode?: string | null }>("GET", `/instance/connect/${INSTANCIA}`);
  return r.base64 ?? null;
}

export async function desconectar() {
  await chamar("DELETE", `/instance/logout/${INSTANCIA}`);
}

/** Envia uma mensagem de texto. `numero` só com dígitos e DDI, ex.: 5531988887777. */
export async function enviarTexto(numero: string, texto: string) {
  const r = await chamar<{ key?: { id?: string } }>("POST", `/message/sendText/${INSTANCIA}`, { number: numero, text: texto });
  return { idExterno: r.key?.id ?? null };
}
