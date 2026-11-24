// A empresa pode usar o CRM agora? (Fase F)
// - ATIVA: pode.
// - EM_TESTE: pode até `testeAte` (sem data = teste sem prazo).
// - SUSPENSA, ou teste vencido: ninguém entra, e o relógio não envia nada por ela
//   (agendadas, campanhas, webhooks). O chatbot e o aviso de fora do horário também param.
//   As mensagens recebidas continuam sendo gravadas, para nada se perder.
// Sem banco e sem "server-only": contas puras, usadas pelas telas, pelo relógio e pelos testes.
import type { Prisma, SituacaoEmpresa } from "../../generated/prisma/client";

type Empresa = { situacao: SituacaoEmpresa; testeAte: Date | null };

export function empresaLiberada(org: Empresa, agora = new Date()) {
  if (org.situacao === "ATIVA") return true;
  if (org.situacao === "EM_TESTE") return !org.testeAte || org.testeAte > agora;
  return false;
}

/** Por que a empresa está bloqueada (para a tela de login). */
export function motivoBloqueio(org: Empresa, agora = new Date()) {
  if (empresaLiberada(org, agora)) return null;
  return org.situacao === "SUSPENSA"
    ? "O acesso desta empresa está suspenso. Fale com o suporte do CRM."
    : "O período de teste desta empresa terminou. Fale com o suporte do CRM para continuar.";
}

/** Filtro do Prisma: só organizações liberadas. Use dentro de `organizacao: { ... }`. */
export function ondeLiberada(agora = new Date()): Prisma.OrganizacaoWhereInput {
  return {
    OR: [{ situacao: "ATIVA" }, { situacao: "EM_TESTE", OR: [{ testeAte: null }, { testeAte: { gt: agora } }] }],
  };
}

/** Dias que faltam para o fim do teste (0 = termina hoje). */
export function diasRestantes(fim: Date, agora = new Date()) {
  return Math.max(0, Math.ceil((fim.getTime() - agora.getTime()) / 86_400_000));
}
