// Conexão única com o banco de dados.
// Em desenvolvimento o Next.js recarrega os arquivos a cada mudança. Guardamos
// o cliente em `globalThis` para não abrir uma conexão nova a cada recarga.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function criarCliente() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // O banco local do `prisma dev` aceita só UMA conexão por vez.
    // Na VPS (PostgreSQL de verdade) use DATABASE_POOL_MAX=10, por exemplo.
    max: Number(process.env.DATABASE_POOL_MAX ?? 1),
  });
  return new PrismaClient({ adapter });
}

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalParaPrisma.prisma ?? criarCliente();

if (process.env.NODE_ENV !== "production") globalParaPrisma.prisma = db;
