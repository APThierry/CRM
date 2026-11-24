// Trava do PostgreSQL por assunto ("certificado", "usuarios"...) e chave (a empresa).
// Vale até o fim da transação: duas requisições ao mesmo tempo passam uma de cada vez.
// Empresas diferentes não esperam umas pelas outras.
import type { Prisma } from "../generated/prisma/client";

export const travar = (tx: Prisma.TransactionClient, assunto: string, chave: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${assunto}), hashtext(${chave}))`;

/** Tempo para transações que podem esperar na fila da trava. */
export const ESPERA_TRAVA = { maxWait: 15_000, timeout: 20_000 };
