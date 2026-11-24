-- AlterTable
ALTER TABLE "Organizacao" ADD COLUMN     "arquivosKb" INTEGER;

-- CreateTable
CREATE TABLE "Convite" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "papel" "Papel" NOT NULL DEFAULT 'VENDEDOR',
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Convite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadastroPendente" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "empresa" TEXT NOT NULL,
    "ramo" TEXT,
    "telefone" TEXT,
    "termosVersao" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CadastroPendente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvioDiario" (
    "organizacaoId" TEXT NOT NULL,
    "dia" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EnvioDiario_pkey" PRIMARY KEY ("organizacaoId","dia")
);

-- CreateIndex
CREATE UNIQUE INDEX "Convite_tokenHash_key" ON "Convite"("tokenHash");

-- CreateIndex
CREATE INDEX "Convite_expiraEm_idx" ON "Convite"("expiraEm");

-- CreateIndex
CREATE UNIQUE INDEX "Convite_organizacaoId_email_key" ON "Convite"("organizacaoId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "CadastroPendente_tokenHash_key" ON "CadastroPendente"("tokenHash");

-- CreateIndex
CREATE INDEX "CadastroPendente_email_idx" ON "CadastroPendente"("email");

-- CreateIndex
CREATE INDEX "CadastroPendente_expiraEm_idx" ON "CadastroPendente"("expiraEm");

-- CreateIndex
CREATE INDEX "EntregaWebhook_webhookId_status_proximaEm_idx" ON "EntregaWebhook"("webhookId", "status", "proximaEm");

-- CreateIndex
CREATE INDEX "MensagemAgendada_organizacaoId_status_enviarEm_idx" ON "MensagemAgendada"("organizacaoId", "status", "enviarEm");

-- AddForeignKey
ALTER TABLE "Convite" ADD CONSTRAINT "Convite_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvioDiario" ADD CONSTRAINT "EnvioDiario_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
