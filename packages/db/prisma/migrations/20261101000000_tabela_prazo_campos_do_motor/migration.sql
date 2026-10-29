-- Campos que o motor de prazos exige de cada versão da tabela (HU15, ADR-007; curadoria V2, aba 9).
-- Expand: colunas novas com valor padrão conservador; nada é removido.

-- Juizado especial criminal conta como o penal (V2, Q17: CPP, art. 798, c/c Lei 9.099/1995, art. 92).
ALTER TYPE "ramo_processual" ADD VALUE 'juizado_criminal';

CREATE TYPE "contagem_prazo" AS ENUM ('uteis', 'corridos');
-- Quem dobra naquele ato (V2, aba 9, coluna "Prazo em dobro"; Q16).
CREATE TYPE "politica_dobro" AS ENUM ('entes_cpc', 'so_defensoria', 'fazenda_para_recorrer', 'nao_dobra', 'verificar');
-- Se o motor calcula sozinho, a partir da data informada pelo advogado, ou só alerta.
CREATE TYPE "calculo_prazo" AS ENUM ('automatico', 'data_informada', 'nao_calcula');
-- Órgão cujo calendário vale para o ato (V2, aba 8, "Calendário por órgão").
CREATE TYPE "local_do_ato" AS ENUM ('orgao_do_processo', 'juizo_de_origem', 'tribunal_de_segundo_grau', 'orgao_da_decisao', 'tribunal_superior', 'nao_se_aplica');

ALTER TABLE "tabela_prazo"
  ADD COLUMN "contagem" "contagem_prazo",
  -- "verificar": o motor sugere o prazo simples (o mais cedo) e mostra o dobro como alternativa.
  ADD COLUMN "politica_dobro" "politica_dobro" NOT NULL DEFAULT 'verificar',
  ADD COLUMN "calculo" "calculo_prazo" NOT NULL DEFAULT 'automatico',
  ADD COLUMN "marco_inicial" TEXT,
  ADD COLUMN "local_do_ato" "local_do_ato",
  ADD COLUMN "alerta" TEXT;

-- Contagem das versões já gravadas: a regra do ramo (CPC, art. 219; CLT, art. 775; Lei 9.099/1995,
-- art. 12-A; CPP, art. 798). O gatilho de imutabilidade fica desligado só para este preenchimento.
ALTER TABLE "tabela_prazo" DISABLE TRIGGER "tabela_prazo_imutavel";
UPDATE "tabela_prazo" SET "contagem" = CASE WHEN "ramo" = 'penal' THEN 'corridos' ELSE 'uteis' END::"contagem_prazo";
ALTER TABLE "tabela_prazo" ENABLE TRIGGER "tabela_prazo_imutavel";
ALTER TABLE "tabela_prazo" ALTER COLUMN "contagem" SET NOT NULL;

-- A aprovação continua sem mexer no conteúdo proposto, agora com as colunas novas.
CREATE OR REPLACE FUNCTION pz_tabela_prazo_imutavel() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'rascunho' AND NEW.status = 'aprovado'
     AND (NEW.id, NEW.tipo_ato, NEW.ramo, NEW.versao, NEW.dias, NEW.unidade, NEW.fundamento,
          NEW.fonte_url, NEW.vigencia_inicio, NEW.vigencia_fim, NEW.proposto_por, NEW.proposto_em,
          NEW.criado_em, NEW.contagem, NEW.politica_dobro, NEW.calculo, NEW.marco_inicial,
          NEW.local_do_ato, NEW.alerta)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.tipo_ato, OLD.ramo, OLD.versao, OLD.dias, OLD.unidade, OLD.fundamento,
          OLD.fonte_url, OLD.vigencia_inicio, OLD.vigencia_fim, OLD.proposto_por, OLD.proposto_em,
          OLD.criado_em, OLD.contagem, OLD.politica_dobro, OLD.calculo, OLD.marco_inicial,
          OLD.local_do_ato, OLD.alerta) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'tabela_prazo: % não permitido (versão aprovada é imutável; altere criando nova versão)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;
