// Eventos que o CRM avisa por webhook. Arquivo sem "server-only": a tela de
// Integrações usa a mesma lista para mostrar as caixas de seleção.

export const EVENTOS = {
  "cliente.criado": "Cliente cadastrado",
  "negocio.criado": "Negócio criado no funil",
  "negocio.etapa": "Negócio mudou de etapa",
  "negocio.ganho": "Negócio ganho (venda fechada)",
  "negocio.perdido": "Negócio perdido",
  "mensagem.recebida": "Mensagem recebida no WhatsApp",
  "certificado.emitido": "Certificado emitido",
  "contato.descadastrou": "Contato pediu para sair das campanhas (SAIR)",
} as const;

export type Evento = keyof typeof EVENTOS;

export const ehEvento = (v: string): v is Evento => v in EVENTOS;
