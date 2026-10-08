-- Regras rápidas de classificação (HU20, ADR-008): dado versionado, global, mantido pela
-- curadoria. Cada versão é imutável; a vigente é a maior versão ativa de cada código. Não há
-- regra de data aqui: a regra só aponta um tipo de ato da taxonomia (HU15).
CREATE TABLE "regra_classificacao" (
    "codigo" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "tipo_ato" TEXT NOT NULL,
    -- Expressões regulares sobre o texto minúsculo e sem acento; basta uma casar.
    "padroes" TEXT[] NOT NULL,
    "confianca" NUMERIC(3,2) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regra_classificacao_pkey" PRIMARY KEY ("codigo", "versao"),
    CONSTRAINT "regra_classificacao_versao" CHECK ("versao" >= 1),
    CONSTRAINT "regra_classificacao_confianca" CHECK ("confianca" >= 0 AND "confianca" <= 1),
    CONSTRAINT "regra_classificacao_padroes" CHECK (cardinality("padroes") >= 1)
);

ALTER TABLE "regra_classificacao" ADD CONSTRAINT "regra_classificacao_tipo_ato_fkey" FOREIGN KEY ("tipo_ato") REFERENCES "tipo_ato"("codigo") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Versão publicada não muda: só "ativa" pode ser desligada (para retirar a regra de uso).
CREATE FUNCTION pz_regra_classificacao_imutavel() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'regra_classificacao é só de inserção (versão %/%)', OLD.codigo, OLD.versao;
  END IF;
  IF (NEW.codigo, NEW.versao, NEW.tipo_ato, NEW.padroes, NEW.confianca)
     IS DISTINCT FROM (OLD.codigo, OLD.versao, OLD.tipo_ato, OLD.padroes, OLD.confianca) THEN
    RAISE EXCEPTION 'regra_classificacao: versão publicada é imutável; crie uma nova versão';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER regra_classificacao_imutavel BEFORE UPDATE OR DELETE ON "regra_classificacao"
  FOR EACH ROW EXECUTE FUNCTION pz_regra_classificacao_imutavel();

GRANT SELECT ON "regra_classificacao" TO pz_app, pz_leitura;
GRANT SELECT, INSERT, UPDATE ON "regra_classificacao" TO pz_sistema;
