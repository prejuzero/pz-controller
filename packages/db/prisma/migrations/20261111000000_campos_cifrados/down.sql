-- Reverte 20261111000000_campos_cifrados. Só é possível enquanto todo CPF ainda estiver em claro
-- (antes do job de recifra): sem a chave, o banco não recupera o CPF cifrado.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "advogado" WHERE "cpf" IS NULL)
     OR EXISTS (SELECT 1 FROM "cliente" WHERE "documento" IS NULL AND "documento_cifrado" IS NOT NULL) THEN
    RAISE EXCEPTION 'há campos só cifrados: decifre-os antes de reverter (docs/runbooks/rotacao-de-chaves.md)';
  END IF;
END
$$;
ALTER TABLE "cliente" DROP COLUMN IF EXISTS "documento_cifrado";
ALTER TABLE "advogado" DROP CONSTRAINT IF EXISTS "advogado_cpf_indice_formato";
ALTER TABLE "advogado" DROP CONSTRAINT IF EXISTS "advogado_cpf_presente";
DROP INDEX IF EXISTS "advogado_cpf_indice_key";
ALTER TABLE "advogado" DROP COLUMN IF EXISTS "cpf_indice";
ALTER TABLE "advogado" DROP COLUMN IF EXISTS "cpf_cifrado";
ALTER TABLE "advogado" ALTER COLUMN "cpf" SET NOT NULL;
