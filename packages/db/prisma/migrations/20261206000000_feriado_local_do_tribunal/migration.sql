-- Feriado estadual ou municipal publicado por um tribunal (planilha da curadoria V2, aba 5: "ES ·
-- TRF2", "Colatina · TRF2"; 2.641 eventos): nos níveis UF e município, o tribunal passa a ser
-- opcional e, quando informado, restringe o evento aos processos dele.
ALTER TABLE "evento_calendario" DROP CONSTRAINT "evento_calendario_jurisdicao";
ALTER TABLE "evento_calendario" ADD CONSTRAINT "evento_calendario_jurisdicao" CHECK (
  ("abrangencia" = 'nacional' AND "uf" IS NULL AND "municipio_ibge" IS NULL AND "tribunal" IS NULL AND "comarca" IS NULL)
  OR ("abrangencia" = 'uf' AND "uf" IS NOT NULL AND "municipio_ibge" IS NULL AND "comarca" IS NULL)
  OR ("abrangencia" = 'municipio' AND "uf" IS NOT NULL AND "municipio_ibge" IS NOT NULL AND "comarca" IS NULL)
  OR ("abrangencia" = 'tribunal' AND "uf" IS NULL AND "municipio_ibge" IS NULL AND "tribunal" IS NOT NULL AND "comarca" IS NULL)
  OR ("abrangencia" = 'comarca' AND "uf" IS NULL AND "municipio_ibge" IS NULL AND "tribunal" IS NOT NULL AND "comarca" IS NOT NULL)
);
