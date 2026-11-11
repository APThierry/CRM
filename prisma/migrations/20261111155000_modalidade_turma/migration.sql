-- CreateEnum
CREATE TYPE "Modalidade" AS ENUM ('PRESENCIAL', 'EAD', 'HIBRIDO');

-- AlterTable
ALTER TABLE "Turma" ADD COLUMN     "modalidade" "Modalidade" NOT NULL DEFAULT 'PRESENCIAL';
