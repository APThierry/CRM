import "server-only";
// Agenda em formato iCalendar (.ics) para assinar no Google Agenda, Outlook ou
// no calendário do celular. Cada usuário tem um link secreto próprio:
//   /api/agenda/<código>.ics
// No banco fica só o SHA-256 do código (como nas sessões de login). Gerar um
// link novo invalida o anterior.
//
// O Google Agenda busca o link sozinho de tempos em tempos (algumas horas), então
// mudanças no CRM demoram um pouco para aparecer lá. É só leitura.
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

const hash = (codigo: string) => createHash("sha256").update(codigo).digest("hex");

/** Gera um link novo para o usuário (o anterior para de funcionar). Devolve o código. */
export async function gerarCodigoAgenda(usuarioId: string) {
  const codigo = randomBytes(24).toString("base64url");
  await db.usuario.update({ where: { id: usuarioId }, data: { agendaTokenHash: hash(codigo) } });
  return codigo;
}

export async function desligarAgenda(usuarioId: string) {
  await db.usuario.update({ where: { id: usuarioId }, data: { agendaTokenHash: null } });
}

export async function usuarioDaAgenda(codigo: string) {
  if (!/^[\w-]{20,64}$/.test(codigo)) return null;
  const usuario = await db.usuario.findUnique({ where: { agendaTokenHash: hash(codigo) }, include: { organizacao: true } });
  return usuario?.ativo ? usuario : null;
}

// --- Formato iCalendar (RFC 5545) -------------------------------------------

/** Escapa texto: \ ; , e quebras de linha. */
const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Linhas com mais de 75 bytes são "dobradas" (continuação começa com espaço). */
function dobrar(linha: string) {
  const bytes = Buffer.from(linha, "utf8");
  if (bytes.length <= 75) return linha;
  const partes: string[] = [];
  let atual = "";
  for (const ch of linha) {
    if (Buffer.byteLength(atual + ch, "utf8") > (partes.length ? 74 : 75)) {
      partes.push(atual);
      atual = ch;
    } else atual += ch;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

/** 2026-11-13T13:00:00Z -> 20261113T130000Z */
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Dia (no fuso de Brasília) no formato 20261113. */
const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d).replace(/-/g, "");

const somarDia = (yyyymmdd: string) => {
  const d = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
};

export type EventoAgenda = {
  uid: string;
  titulo: string;
  descricao?: string;
  local?: string | null;
  url?: string;
  /** Evento de dia inteiro (turmas): do dia de `inicio` até o dia de `fim`, inclusive. */
  diaInteiro?: boolean;
  inicio: Date;
  fim?: Date | null;
  minutos?: number;
};

export function montarIcs(nome: string, eventos: EventoAgenda[], agora = new Date()) {
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CRM Brigada//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(nome)}`,
    "X-WR-TIMEZONE:America/Sao_Paulo",
    // Sugere ao Google/Outlook buscar de novo a cada hora (o Google decide sozinho).
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of eventos) {
    linhas.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${utc(agora)}`);
    if (e.diaInteiro) {
      const inicio = dia(e.inicio);
      const ultimo = dia(e.fim && e.fim > e.inicio ? e.fim : e.inicio);
      linhas.push(`DTSTART;VALUE=DATE:${inicio}`, `DTEND;VALUE=DATE:${somarDia(ultimo)}`);
    } else {
      const fim = e.fim ?? new Date(e.inicio.getTime() + (e.minutos ?? 30) * 60_000);
      linhas.push(`DTSTART:${utc(e.inicio)}`, `DTEND:${utc(fim)}`);
    }
    linhas.push(`SUMMARY:${esc(e.titulo)}`);
    if (e.descricao) linhas.push(`DESCRIPTION:${esc(e.descricao)}`);
    if (e.local) linhas.push(`LOCATION:${esc(e.local)}`);
    if (e.url) linhas.push(`URL:${e.url}`);
    linhas.push("END:VEVENT");
  }
  linhas.push("END:VCALENDAR");
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}

// --- O que entra na agenda de cada pessoa ------------------------------------

const DIA = 86_400_000;

/**
 * Turmas (todas da empresa; o instrutor vê só as dele), tarefas abertas da
 * pessoa e mensagens de WhatsApp que ela agendou. Janela: 60 dias para trás e
 * 1 ano para frente.
 */
export async function eventosDoUsuario(
  usuario: { id: string; papel: string; organizacaoId: string },
  base: string,
  agora = new Date(),
): Promise<EventoAgenda[]> {
  const de = new Date(agora.getTime() - 60 * DIA);
  const ate = new Date(agora.getTime() + 365 * DIA);
  const org = usuario.organizacaoId;
  const [turmas, tarefas, agendadas] = await Promise.all([
    db.turma.findMany({
      where: {
        organizacaoId: org,
        status: { not: "CANCELADA" },
        dataInicio: { gte: de, lte: ate },
        ...(usuario.papel === "INSTRUTOR" ? { instrutorId: usuario.id } : {}),
      },
      include: {
        servico: { select: { nome: true, cargaHoraria: true } },
        cliente: { select: { nome: true } },
        instrutor: { select: { nome: true } },
        _count: { select: { matriculas: true } },
      },
      orderBy: { dataInicio: "asc" },
    }),
    db.atividade.findMany({
      where: { organizacaoId: org, usuarioId: usuario.id, tipo: "TAREFA", concluida: false, agendadaPara: { gte: de, lte: ate } },
      include: { cliente: { select: { id: true, nome: true } }, negocio: { select: { titulo: true } } },
    }),
    db.mensagemAgendada.findMany({
      where: { organizacaoId: org, usuarioId: usuario.id, status: "PENDENTE", enviarEm: { gte: de, lte: ate } },
      include: { conversa: { select: { id: true, nome: true, telefone: true, cliente: { select: { nome: true } } } } },
    }),
  ]);

  const eventos: EventoAgenda[] = [];
  for (const t of turmas) {
    const status = { PLANEJADA: "planejada", CONFIRMADA: "confirmada", REALIZADA: "realizada", CANCELADA: "cancelada" }[t.status];
    eventos.push({
      uid: `turma-${t.id}@crm`,
      titulo: `🔥 ${t.servico.nome}${t.cliente ? ` · ${t.cliente.nome}` : ""}${t.status === "PLANEJADA" ? " (a confirmar)" : ""}`,
      descricao: [
        `Turma ${status}`,
        `Inscritos: ${t._count.matriculas}${t.vagas ? ` de ${t.vagas}` : ""}`,
        t.instrutor && `Instrutor: ${t.instrutor.nome}`,
        t.servico.cargaHoraria && `Carga horária: ${t.servico.cargaHoraria} h`,
        `${base}/turmas/${t.id}`,
      ]
        .filter(Boolean)
        .join("\n"),
      local: t.local,
      url: `${base}/turmas/${t.id}`,
      diaInteiro: true,
      inicio: t.dataInicio,
      fim: t.dataFim,
    });
  }
  for (const a of tarefas) {
    const link = a.cliente ? `${base}/clientes/${a.cliente.id}` : base;
    eventos.push({
      uid: `tarefa-${a.id}@crm`,
      titulo: `✔ ${a.descricao.slice(0, 80)}${a.cliente ? ` · ${a.cliente.nome}` : ""}`,
      descricao: [a.descricao, a.negocio && `Negócio: ${a.negocio.titulo}`, link].filter(Boolean).join("\n"),
      url: link,
      inicio: a.agendadaPara!,
      minutos: 30,
    });
  }
  for (const m of agendadas) {
    const quem = m.conversa.cliente?.nome ?? m.conversa.nome ?? m.conversa.telefone;
    eventos.push({
      uid: `whatsapp-${m.id}@crm`,
      titulo: `✉ WhatsApp agendado para ${quem}`,
      descricao: `${m.texto}\n\n${base}/atendimento?c=${m.conversa.id}`,
      url: `${base}/atendimento?c=${m.conversa.id}`,
      inicio: m.enviarEm,
      minutos: 15,
    });
  }
  return eventos;
}
