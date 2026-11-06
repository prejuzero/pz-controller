-- Reverte 20261120000000_campos_cifrados_contract: as colunas em claro voltam vazias (o banco não
-- tem a chave para decifrar). Os dados continuam nas colunas cifradas.
ALTER TABLE "cliente" ADD COLUMN "documento" TEXT;
ALTER TABLE "advogado" ALTER COLUMN "cpf_indice" DROP NOT NULL;
ALTER TABLE "advogado" ALTER COLUMN "cpf_cifrado" DROP NOT NULL;
ALTER TABLE "advogado" ADD COLUMN "cpf" CHAR(11);
CREATE UNIQUE INDEX "advogado_cpf_key" ON "advogado"("cpf");
ALTER TABLE "advogado" ADD CONSTRAINT "advogado_cpf_presente"
  CHECK ("cpf" IS NOT NULL OR ("cpf_cifrado" IS NOT NULL AND "cpf_indice" IS NOT NULL));
