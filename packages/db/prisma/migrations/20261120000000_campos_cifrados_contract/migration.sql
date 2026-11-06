-- Campos sensíveis cifrados (HU37; ADR-021), fase "contract": remove o CPF do advogado e o
-- documento do cliente em claro. Antes, o job cadastro.recifrar-campos cifrou todos os legados
-- e esvaziou as colunas em claro. Sem a chave, o banco não sabe cifrar: se ainda houver valor em
-- claro, a migração recusa (nada é perdido) e pede o job antes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "advogado" WHERE "cpf" IS NOT NULL OR "cpf_cifrado" IS NULL OR "cpf_indice" IS NULL)
     OR EXISTS (SELECT 1 FROM "cliente" WHERE "documento" IS NOT NULL) THEN
    RAISE EXCEPTION 'há CPF ou documento em claro: rode o job cadastro.recifrar-campos antes (docs/runbooks/rotacao-de-chaves.md)';
  END IF;
END
$$;
ALTER TABLE "advogado" DROP CONSTRAINT IF EXISTS "advogado_cpf_presente";
ALTER TABLE "advogado" DROP COLUMN "cpf";
ALTER TABLE "advogado" ALTER COLUMN "cpf_cifrado" SET NOT NULL;
ALTER TABLE "advogado" ALTER COLUMN "cpf_indice" SET NOT NULL;
ALTER TABLE "cliente" DROP COLUMN "documento";
