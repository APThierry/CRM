// Configurações do servidor lidas do .env, num lugar só.
// Sem "server-only" e sem imports: também é usado pelos scripts e pelo instrumentation.

/** Produção de verdade (next start / build). No `npm run dev` e nos scripts é falso. */
export const emProducao = () => process.env.NODE_ENV === "production";

/** Número inteiro do .env (0 ou mais). Vazio ou inválido = o padrão. */
export function numeroDoEnv(nome: string, padrao: number) {
  const valor = process.env[nome]?.trim();
  if (!valor) return padrao;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : padrao;
}

/** Tetos por empresa e do servidor. Todos podem ser mudados no .env (veja .env.example). */
export const LIMITES = {
  /** Mensagens por dia que uma empresa ainda não aprovada pode começar (para quem não escreveu nas últimas 24 h). */
  enviosPorDia: () => numeroDoEnv("ENVIOS_DIA_NAO_APROVADA", 50),
  /** Mensagens agendadas esperando a hora, por empresa. */
  agendadasPendentes: (aprovada: boolean) =>
    aprovada ? numeroDoEnv("AGENDADAS_PENDENTES", 5000) : numeroDoEnv("AGENDADAS_PENDENTES_NAO_APROVADA", 200),
  /** Avisos de webhook esperando na fila, por empresa. */
  avisosPendentes: () => numeroDoEnv("WEBHOOKS_PENDENTES", 2000),
  /** Usuários ativos + convites válidos, por empresa. */
  usuarios: () => numeroDoEnv("USUARIOS_POR_EMPRESA", 50),
  /** Espaço em disco dos arquivos do WhatsApp, por empresa (MB). */
  arquivosMb: (aprovada: boolean) => (aprovada ? numeroDoEnv("ARQUIVOS_MB_POR_EMPRESA", 10_240) : numeroDoEnv("ARQUIVOS_MB_NAO_APROVADA", 1024)),
  /** Maior mídia recebida que guardamos (MB). Acima disso fica só o texto. */
  midiaRecebidaMb: () => numeroDoEnv("MIDIA_RECEBIDA_MB", 20),
  /** Números de WhatsApp (instâncias da Evolution API) no servidor todo. */
  instanciasWhatsapp: () => numeroDoEnv("INSTANCIAS_WHATSAPP", 10),
};

/** Endereço público válido para produção: https, sem caminho, sem usuário e senha. */
export function appUrlValida(valor: string | undefined) {
  try {
    const url = new URL((valor ?? "").trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" || !url.hostname.includes(".")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Código do primeiro acesso em produção. Curto demais = como se não existisse. */
export function setupToken() {
  const token = process.env.SETUP_TOKEN?.trim() ?? "";
  return token.length >= 16 ? token : null;
}

/** O que falta configurar em produção (mostrado no terminal quando o servidor liga). */
export function avisosDeConfiguracao() {
  const avisos: string[] = [];
  if (!appUrlValida(process.env.APP_URL)) avisos.push("APP_URL precisa ser um endereço https:// válido. Sem ele, nenhum link (convite, senha, agenda) é gerado.");
  if (!process.env.PROXY_IP_HEADER?.trim()) avisos.push("PROXY_IP_HEADER não definido: os limites por IP ficam DESLIGADOS e qualquer pessoa pode atrapalhar o login dos outros. Configure antes de abrir o CRM ao público.");
  if (!process.env.SMTP_HOST?.trim()) avisos.push("SMTP_HOST não definido: nenhum e-mail sai.");
  const segredo = process.env.WHATSAPP_WEBHOOK_SEGREDO?.trim() ?? "";
  if (segredo.length < 16 || segredo.startsWith("troque-")) avisos.push("WHATSAPP_WEBHOOK_SEGREDO fraco ou de exemplo: troque por um texto aleatório (quem souber pode inventar mensagens recebidas).");
  if (numeroDoEnv("DATABASE_POOL_MAX", 1) < 2) avisos.push("DATABASE_POOL_MAX não definido ou 1: o CRM usa uma conexão só com o banco e fica lento. Na VPS use 10.");
  if (process.env.SETUP_TOKEN && !setupToken()) avisos.push("SETUP_TOKEN tem menos de 16 caracteres e foi ignorado.");
  return avisos;
}
