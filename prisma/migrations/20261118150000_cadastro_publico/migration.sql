-- CreateEnum
CREATE TYPE "TipoCodigoEmail" AS ENUM ('CONFIRMAR_EMAIL', 'NOVA_SENHA');

-- AlterTable
ALTER TABLE "Organizacao" ADD COLUMN     "campanhasLiberadas" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ramo" TEXT,
ADD COLUMN     "termosAceitosEm" TIMESTAMP(3),
ADD COLUMN     "termosVersao" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "emailConfirmadoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CodigoEmail" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoCodigoEmail" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodigoEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodigoEmail_tokenHash_key" ON "CodigoEmail"("tokenHash");

-- CreateIndex
CREATE INDEX "CodigoEmail_usuarioId_tipo_idx" ON "CodigoEmail"("usuarioId", "tipo");

-- AddForeignKey
ALTER TABLE "CodigoEmail" ADD CONSTRAINT "CodigoEmail_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Quem já existia foi cadastrado pelo administrador ou pelo seed: conta como confirmado.
UPDATE "Usuario" SET "emailConfirmadoEm" = CURRENT_TIMESTAMP WHERE "emailConfirmadoEm" IS NULL;
