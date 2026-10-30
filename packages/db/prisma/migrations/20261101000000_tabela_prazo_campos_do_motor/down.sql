-- Reverte 20261101000000_tabela_prazo_campos_do_motor (falha se houver versão do juizado criminal).
CREATE OR REPLACE FUNCTION pz_tabela_prazo_imutavel() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'rascunho' AND NEW.status = 'aprovado'
     AND (NEW.id, NEW.tipo_ato, NEW.ramo, NEW.versao, NEW.dias, NEW.unidade, NEW.fundamento,
          NEW.fonte_url, NEW.vigencia_inicio, NEW.vigencia_fim, NEW.proposto_por, NEW.proposto_em,
          NEW.criado_em)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.tipo_ato, OLD.ramo, OLD.versao, OLD.dias, OLD.unidade, OLD.fundamento,
          OLD.fonte_url, OLD.vigencia_inicio, OLD.vigencia_fim, OLD.proposto_por, OLD.proposto_em,
          OLD.criado_em) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'tabela_prazo: % não permitido (versão aprovada é imutável; altere criando nova versão)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

ALTER TABLE "tabela_prazo"
  DROP COLUMN "contagem",
  DROP COLUMN "politica_dobro",
  DROP COLUMN "calculo",
  DROP COLUMN "marco_inicial",
  DROP COLUMN "local_do_ato",
  DROP COLUMN "alerta";
DROP TYPE "contagem_prazo";
DROP TYPE "politica_dobro";
DROP TYPE "calculo_prazo";
DROP TYPE "local_do_ato";

ALTER TYPE "ramo_processual" RENAME TO "ramo_processual_antigo";
CREATE TYPE "ramo_processual" AS ENUM ('civel', 'juizados', 'trabalhista', 'penal');
ALTER TABLE "tabela_prazo" ALTER COLUMN "ramo" TYPE "ramo_processual" USING "ramo"::text::"ramo_processual";
DROP TYPE "ramo_processual_antigo";
