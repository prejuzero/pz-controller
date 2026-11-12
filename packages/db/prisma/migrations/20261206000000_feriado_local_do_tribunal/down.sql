-- Reverte 20261206000000_feriado_local_do_tribunal (falha se houver evento UF ou município com
-- tribunal: revogue-os antes).
ALTER TABLE "evento_calendario" DROP CONSTRAINT "evento_calendario_jurisdicao";
ALTER TABLE "evento_calendario" ADD CONSTRAINT "evento_calendario_jurisdicao" CHECK (
  ("abrangencia" = 'nacional' AND "uf" IS NULL AND "municipio_ibge" IS NULL AND "tribunal" IS NULL AND "comarca" IS NULL)
  OR ("abrangencia" = 'uf' AND "uf" IS NOT NULL AND "municipio_ibge" IS NULL AND "tribunal" IS NULL AND "comarca" IS NULL)
  OR ("abrangencia" = 'municipio' AND "uf" IS NOT NULL AND "municipio_ibge" IS NOT NULL AND "tribunal" IS NULL AND "comarca" IS NULL)
  OR ("abrangencia" = 'tribunal' AND "uf" IS NULL AND "municipio_ibge" IS NULL AND "tribunal" IS NOT NULL AND "comarca" IS NULL)
  OR ("abrangencia" = 'comarca' AND "uf" IS NULL AND "municipio_ibge" IS NULL AND "tribunal" IS NOT NULL AND "comarca" IS NOT NULL)
);
