-- CreateEnum
CREATE TYPE "StatusAgendamento" AS ENUM ('PENDENTE', 'ENVIANDO', 'ENVIADA', 'CANCELADA', 'ERRO');

-- AlterTable
ALTER TABLE "Conversa" ADD COLUMN     "botEtapa" TEXT,
ADD COLUMN     "botTentativas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "foraHorarioEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ConfiguracaoAutomacao" (
    "organizacaoId" TEXT NOT NULL,
    "horarioAtivo" BOOLEAN NOT NULL DEFAULT false,
    "horarios" JSONB NOT NULL,
    "mensagemForaHorario" TEXT NOT NULL,
    "botAtivo" BOOLEAN NOT NULL DEFAULT false,
    "botBoasVindas" TEXT NOT NULL,
    "botReativarHoras" INTEGER NOT NULL DEFAULT 24,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoAutomacao_pkey" PRIMARY KEY ("organizacaoId")
);

-- CreateTable
CREATE TABLE "OpcaoBot" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "rotulo" TEXT NOT NULL,
    "resposta" TEXT,
    "etiquetaId" TEXT,
    "atendenteId" TEXT,

    CONSTRAINT "OpcaoBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequencia" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sequencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassoSequencia" (
    "id" TEXT NOT NULL,
    "sequenciaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "esperaMinutos" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,

    CONSTRAINT "PassoSequencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensagemAgendada" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "sequenciaId" TEXT,
    "texto" TEXT NOT NULL,
    "enviarEm" TIMESTAMP(3) NOT NULL,
    "cancelarSeResponder" BOOLEAN NOT NULL DEFAULT true,
    "status" "StatusAgendamento" NOT NULL DEFAULT 'PENDENTE',
    "motivo" TEXT,
    "enviadaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemAgendada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpcaoBot_organizacaoId_ordem_idx" ON "OpcaoBot"("organizacaoId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "Sequencia_organizacaoId_nome_key" ON "Sequencia"("organizacaoId", "nome");

-- CreateIndex
CREATE INDEX "PassoSequencia_sequenciaId_ordem_idx" ON "PassoSequencia"("sequenciaId", "ordem");

-- CreateIndex
CREATE INDEX "MensagemAgendada_status_enviarEm_idx" ON "MensagemAgendada"("status", "enviarEm");

-- CreateIndex
CREATE INDEX "MensagemAgendada_conversaId_status_idx" ON "MensagemAgendada"("conversaId", "status");

-- AddForeignKey
ALTER TABLE "ConfiguracaoAutomacao" ADD CONSTRAINT "ConfiguracaoAutomacao_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcaoBot" ADD CONSTRAINT "OpcaoBot_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcaoBot" ADD CONSTRAINT "OpcaoBot_etiquetaId_fkey" FOREIGN KEY ("etiquetaId") REFERENCES "Etiqueta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcaoBot" ADD CONSTRAINT "OpcaoBot_atendenteId_fkey" FOREIGN KEY ("atendenteId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sequencia" ADD CONSTRAINT "Sequencia_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassoSequencia" ADD CONSTRAINT "PassoSequencia_sequenciaId_fkey" FOREIGN KEY ("sequenciaId") REFERENCES "Sequencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensagemAgendada" ADD CONSTRAINT "MensagemAgendada_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensagemAgendada" ADD CONSTRAINT "MensagemAgendada_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensagemAgendada" ADD CONSTRAINT "MensagemAgendada_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensagemAgendada" ADD CONSTRAINT "MensagemAgendada_sequenciaId_fkey" FOREIGN KEY ("sequenciaId") REFERENCES "Sequencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
