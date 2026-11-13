-- Central de atendimento: conversas, etiquetas, respostas rápidas e mídia.
-- As mensagens que já existem são agrupadas em conversas (uma por número)
-- antes de "conversaId" virar obrigatório.
-- CreateEnum
CREATE TYPE "StatusConversa" AS ENUM ('ABERTA', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "TipoMensagem" AS ENUM ('TEXTO', 'IMAGEM', 'AUDIO', 'VIDEO', 'DOCUMENTO', 'FIGURINHA', 'OUTRO');

-- AlterTable
ALTER TABLE "MensagemWhatsapp" ADD COLUMN     "arquivo" TEXT,
ADD COLUMN     "conversaId" TEXT,
ADD COLUMN     "mimetype" TEXT,
ADD COLUMN     "nomeArquivo" TEXT,
ADD COLUMN     "tipo" "TipoMensagem" NOT NULL DEFAULT 'TEXTO';

-- CreateTable
CREATE TABLE "Conversa" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT,
    "clienteId" TEXT,
    "contatoId" TEXT,
    "atendenteId" TEXT,
    "status" "StatusConversa" NOT NULL DEFAULT 'ABERTA',
    "naoLidas" INTEGER NOT NULL DEFAULT 0,
    "ultimaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaTexto" TEXT,
    "ultimaDirecao" "DirecaoMensagem",
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Etiqueta" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#64748b',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Etiqueta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespostaRapida" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "atalho" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespostaRapida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ConversaToEtiqueta" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ConversaToEtiqueta_AB_pkey" PRIMARY KEY ("A","B")
);


-- Agrupa as mensagens existentes em conversas.
-- chave = DDD + 8 últimos dígitos (mesma regra de chaveTelefone em src/lib/formatar.ts).
WITH m AS (
  SELECT *,
    regexp_replace(regexp_replace("telefone", '\D', '', 'g'), '^55(?=\d{10,11}$)', '') AS d
  FROM "MensagemWhatsapp"
), k AS (
  SELECT *, left(d, 2) || right(d, 8) AS chave FROM m WHERE length(d) >= 10
), ultima AS (
  SELECT DISTINCT ON ("organizacaoId", chave) "organizacaoId", chave, "telefone", "clienteId", "contatoId",
    "criadoEm", left("conteudo", 200) AS texto, "direcao"
  FROM k ORDER BY "organizacaoId", chave, "criadoEm" DESC
), nome AS (
  -- Nas mensagens recebidas, "status" guardava o nome do perfil (pushName).
  SELECT DISTINCT ON ("organizacaoId", chave) "organizacaoId", chave, "status" AS nome
  FROM k WHERE "direcao" = 'ENTRADA' AND "status" IS NOT NULL
  ORDER BY "organizacaoId", chave, "criadoEm" DESC
)
INSERT INTO "Conversa" ("id", "organizacaoId", "telefone", "chave", "nome", "clienteId", "contatoId", "ultimaEm", "ultimaTexto", "ultimaDirecao")
SELECT 'conv_' || md5(u."organizacaoId" || u.chave), u."organizacaoId", u."telefone", u.chave, n.nome,
  u."clienteId", u."contatoId", u."criadoEm", u.texto, u."direcao"
FROM ultima u LEFT JOIN nome n ON n."organizacaoId" = u."organizacaoId" AND n.chave = u.chave;

UPDATE "MensagemWhatsapp" SET "conversaId" = 'conv_' || md5("organizacaoId" || (
  left(regexp_replace(regexp_replace("telefone", '\D', '', 'g'), '^55(?=\d{10,11}$)', ''), 2) ||
  right(regexp_replace("telefone", '\D', '', 'g'), 8)
));

-- Se sobrar mensagem sem conversa (número inválido), o comando abaixo falha e
-- nada é alterado: melhor parar do que perder mensagens.
ALTER TABLE "MensagemWhatsapp" ALTER COLUMN "conversaId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Conversa_organizacaoId_status_ultimaEm_idx" ON "Conversa"("organizacaoId", "status", "ultimaEm");

-- CreateIndex
CREATE INDEX "Conversa_atendenteId_idx" ON "Conversa"("atendenteId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversa_organizacaoId_chave_key" ON "Conversa"("organizacaoId", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "Etiqueta_organizacaoId_nome_key" ON "Etiqueta"("organizacaoId", "nome");

-- CreateIndex
CREATE INDEX "RespostaRapida_organizacaoId_idx" ON "RespostaRapida"("organizacaoId");

-- CreateIndex
CREATE INDEX "_ConversaToEtiqueta_B_index" ON "_ConversaToEtiqueta"("B");

-- CreateIndex
CREATE INDEX "MensagemWhatsapp_conversaId_criadoEm_idx" ON "MensagemWhatsapp"("conversaId", "criadoEm");

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "Contato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_atendenteId_fkey" FOREIGN KEY ("atendenteId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaRapida" ADD CONSTRAINT "RespostaRapida_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaRapida" ADD CONSTRAINT "RespostaRapida_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensagemWhatsapp" ADD CONSTRAINT "MensagemWhatsapp_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConversaToEtiqueta" ADD CONSTRAINT "_ConversaToEtiqueta_A_fkey" FOREIGN KEY ("A") REFERENCES "Conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConversaToEtiqueta" ADD CONSTRAINT "_ConversaToEtiqueta_B_fkey" FOREIGN KEY ("B") REFERENCES "Etiqueta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
