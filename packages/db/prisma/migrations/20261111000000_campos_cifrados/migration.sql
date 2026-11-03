-- Campos sensíveis cifrados (HU37, PZ-219; ADR-021), fase "expand": o CPF do advogado e o
-- documento do cliente passam a ser gravados cifrados (chave de dados identificada) e o CPF
-- ganha um índice cego (HMAC) para continuar único. As colunas em claro ficam vazias nos novos
-- registros; o job de recifra esvazia as antigas. A fase "contract" (remover cpf e documento)
-- vem depois que o job rodar em todos os ambientes.
ALTER TABLE "advogado" ALTER COLUMN "cpf" DROP NOT NULL;
ALTER TABLE "advogado" ADD COLUMN "cpf_cifrado" TEXT;
ALTER TABLE "advogado" ADD COLUMN "cpf_indice" CHAR(64);
CREATE UNIQUE INDEX "advogado_cpf_indice_key" ON "advogado"("cpf_indice");
ALTER TABLE "advogado" ADD CONSTRAINT "advogado_cpf_presente"
  CHECK ("cpf" IS NOT NULL OR ("cpf_cifrado" IS NOT NULL AND "cpf_indice" IS NOT NULL));
ALTER TABLE "advogado" ADD CONSTRAINT "advogado_cpf_indice_formato"
  CHECK ("cpf_indice" IS NULL OR "cpf_indice" ~ '^[0-9a-f]{64}$');

ALTER TABLE "cliente" ADD COLUMN "documento_cifrado" TEXT;
