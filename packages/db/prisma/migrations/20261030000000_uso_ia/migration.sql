-- Uso de IA da plataforma (HU21): chamadas, tokens e custo estimado (US$, preço de tabela em
-- packages/ia/configuracao/tarefas.json) por dia de Brasília, tarefa e modelo. Painel de custo
-- do administrador e orçamento diário. Sem tenant_id: a classificação é global (uma por
-- conteúdo) e o custo é da plataforma; o orçamento mensal por escritório segue em @pz/ia.
CREATE TABLE "uso_ia" (
    "dia" DATE NOT NULL,
    "tarefa" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "chamadas" INTEGER NOT NULL DEFAULT 0,
    "tokens_entrada" BIGINT NOT NULL DEFAULT 0,
    "tokens_saida" BIGINT NOT NULL DEFAULT 0,
    "tokens_cache_lidos" BIGINT NOT NULL DEFAULT 0,
    "custo_estimado_usd" NUMERIC(14,6) NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uso_ia_pkey" PRIMARY KEY ("dia", "tarefa", "modelo"),
    CONSTRAINT "uso_ia_nao_negativo" CHECK (
        "chamadas" >= 0 AND "tokens_entrada" >= 0 AND "tokens_saida" >= 0
        AND "tokens_cache_lidos" >= 0 AND "custo_estimado_usd" >= 0
    )
);

-- O worker acumula (upsert sem tenant) e o administrador lê. Nada apaga.
GRANT SELECT, INSERT, UPDATE ON "uso_ia" TO pz_app;
GRANT SELECT ON "uso_ia" TO pz_leitura;
