-- CreateEnum
CREATE TYPE "SituacaoEmpresa" AS ENUM ('EM_TESTE', 'ATIVA', 'SUSPENSA');

-- AlterTable
ALTER TABLE "Organizacao" ADD COLUMN     "situacao" "SituacaoEmpresa" NOT NULL DEFAULT 'ATIVA',
ADD COLUMN     "testeAte" TIMESTAMP(3);
