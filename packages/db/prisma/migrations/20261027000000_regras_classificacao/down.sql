-- Reverte 20261027000000_regras_classificacao.
DROP TABLE IF EXISTS "regra_classificacao";
DROP FUNCTION IF EXISTS pz_regra_classificacao_imutavel();
