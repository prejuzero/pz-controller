-- Histórico verificável do prazo (HU35, PZ-213): cada PDF emitido guarda quais registros da trilha
-- trouxe. A verificação pública relê esses registros e recalcula os hashes (ADR-006). O código
-- traz o tenant, então a consulta roda no tenant (RLS), sem acesso global.
CREATE TABLE "verificacao_historico" (
    "codigo" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT NOT NULL,
    "sequencias" BIGINT[] NOT NULL,
    "emitida_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verificacao_historico_pkey" PRIMARY KEY ("codigo"),
    CONSTRAINT "verificacao_historico_codigo" CHECK ("codigo" ~ '^[0-9a-f-]{36}\.[0-9a-f]{64}$')
);
CREATE INDEX "verificacao_historico_tenant_id_entidade_idx" ON "verificacao_historico"("tenant_id", "entidade", "entidade_id");
ALTER TABLE "verificacao_historico" ADD CONSTRAINT "verificacao_historico_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
SELECT pz_habilitar_rls('verificacao_historico');

-- O histórico verificável sai pelo pipeline de relatórios (HU29): tipo novo.
ALTER TABLE "relatorio" DROP CONSTRAINT "relatorio_tipo";
ALTER TABLE "relatorio" ADD CONSTRAINT "relatorio_tipo"
  CHECK ("tipo" IN ('agenda', 'busca-prazos', 'busca-publicacoes', 'controle-ciencia', 'historico-prazo'));
