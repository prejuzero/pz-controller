-- Reverte 20261103000000_prazo_ciclo_de_vida.
DROP INDEX IF EXISTS "prazo_tenant_id_publicacao_conteudo_id_key";
ALTER TABLE "prazo" DROP COLUMN IF EXISTS "motivo_ajuste";
ALTER TABLE "prazo" DROP COLUMN IF EXISTS "classificacao_incerta";
ALTER TABLE "prazo" DROP COLUMN IF EXISTS "parametros";
