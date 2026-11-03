-- Reverte 20261113000000_controle_ciencia (relatórios de controle de ciência são apagados).
DROP INDEX IF EXISTS "notificacao_tenant_id_prazo_id_idx";
DELETE FROM "relatorio" WHERE "tipo" = 'controle-ciencia';
ALTER TABLE "relatorio" DROP CONSTRAINT "relatorio_tipo";
ALTER TABLE "relatorio" ADD CONSTRAINT "relatorio_tipo"
  CHECK ("tipo" IN ('agenda', 'busca-prazos', 'busca-publicacoes'));
