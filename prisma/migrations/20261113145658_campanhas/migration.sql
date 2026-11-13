-- CreateEnum
CREATE TYPE "TipoCampanha" AS ENUM ('MANUAL', 'RECICLAGEM');

-- CreateEnum
CREATE TYPE "StatusCampanha" AS ENUM ('RASCUNHO', 'AGENDADA', 'ENVIANDO', 'PAUSADA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusDestinatario" AS ENUM ('PENDENTE', 'ENVIANDO', 'ENVIADA', 'ERRO', 'IGNORADA');

-- AlterTable
ALTER TABLE "ConfiguracaoAutomacao" ADD COLUMN     "reciclagemDias" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "reciclagemTexto" TEXT NOT NULL DEFAULT '{Olá|Oi}{, primeiro_nome}! Aqui é da {empresa}. Os certificados de {curso} da {cliente} vencem em {vencimento}. Quer que a gente já reserve a turma de reciclagem?';

-- AlterTable
ALTER TABLE "Matricula" ADD COLUMN     "reciclagemEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Campanha" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCampanha" NOT NULL DEFAULT 'MANUAL',
    "texto" TEXT NOT NULL,
    "filtro" JSONB,
    "status" "StatusCampanha" NOT NULL DEFAULT 'RASCUNHO',
    "iniciarEm" TIMESTAMP(3),
    "proximoEnvioEm" TIMESTAMP(3),
    "motivo" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),

    CONSTRAINT "Campanha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DestinatarioCampanha" (
    "id" TEXT NOT NULL,
    "campanhaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "contatoId" TEXT,
    "negocioId" TEXT,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "variaveis" JSONB,
    "status" "StatusDestinatario" NOT NULL DEFAULT 'PENDENTE',
    "motivo" TEXT,
    "textoFinal" TEXT,
    "idExterno" TEXT,
    "enviadaEm" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "lidaEm" TIMESTAMP(3),
    "respondeuEm" TIMESTAMP(3),

    CONSTRAINT "DestinatarioCampanha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Descadastro" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Descadastro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campanha_organizacaoId_status_idx" ON "Campanha"("organizacaoId", "status");

-- CreateIndex
CREATE INDEX "DestinatarioCampanha_campanhaId_status_ordem_idx" ON "DestinatarioCampanha"("campanhaId", "status", "ordem");

-- CreateIndex
CREATE INDEX "DestinatarioCampanha_idExterno_idx" ON "DestinatarioCampanha"("idExterno");

-- CreateIndex
CREATE INDEX "DestinatarioCampanha_chave_enviadaEm_idx" ON "DestinatarioCampanha"("chave", "enviadaEm");

-- CreateIndex
CREATE UNIQUE INDEX "DestinatarioCampanha_campanhaId_chave_key" ON "DestinatarioCampanha"("campanhaId", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "Descadastro_organizacaoId_chave_key" ON "Descadastro"("organizacaoId", "chave");

-- AddForeignKey
ALTER TABLE "Campanha" ADD CONSTRAINT "Campanha_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campanha" ADD CONSTRAINT "Campanha_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinatarioCampanha" ADD CONSTRAINT "DestinatarioCampanha_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "Campanha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinatarioCampanha" ADD CONSTRAINT "DestinatarioCampanha_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinatarioCampanha" ADD CONSTRAINT "DestinatarioCampanha_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Descadastro" ADD CONSTRAINT "Descadastro_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
