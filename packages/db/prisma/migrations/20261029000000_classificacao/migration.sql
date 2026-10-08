-- Classificação das publicações (HU21, ADR-008/014): uma por conteúdo global, gravada na primeira
-- vez que um escritório recebe o conteúdo. Diz o ato e o prazo citado no texto, nunca uma data.
-- Sem tenant_id: o conteúdo é global (publicacao_conteudo); cada escritório vê a classificação
-- só dos conteúdos que recebeu (pelo módulo publicacoes).
CREATE TABLE "classificacao" (
    "conteudo_id" UUID NOT NULL,
    "origem" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "tipo_ato" TEXT,
    "confianca" NUMERIC(3,2),
    "prazo_citado" JSONB,
    "evidencias" JSONB NOT NULL DEFAULT '[]',
    "regra_codigo" TEXT,
    "regra_versao" INTEGER,
    "versao_prompt" TEXT,
    "modelo" TEXT,
    "motivo" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classificacao_pkey" PRIMARY KEY ("conteudo_id"),
    CONSTRAINT "classificacao_origem" CHECK ("origem" IN ('regra', 'ia', 'nenhuma')),
    CONSTRAINT "classificacao_situacao" CHECK ("situacao" IN ('ok', 'a_confirmar', 'revisao_manual')),
    CONSTRAINT "classificacao_confianca" CHECK ("confianca" IS NULL OR ("confianca" >= 0 AND "confianca" <= 1)),
    -- "ok" exige um ato da taxonomia.
    CONSTRAINT "classificacao_ok_com_ato" CHECK ("situacao" <> 'ok' OR "tipo_ato" IS NOT NULL)
);

ALTER TABLE "classificacao" ADD CONSTRAINT "classificacao_tipo_ato_fkey" FOREIGN KEY ("tipo_ato") REFERENCES "tipo_ato"("codigo") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "classificacao_situacao_idx" ON "classificacao"("situacao");

-- A aplicação grava (consumidor do evento, na transação do escritório) e lê; a correção humana
-- (revisão manual, HU22) atualiza pelo papel sistema. Nada apaga.
GRANT SELECT, INSERT ON "classificacao" TO pz_app;
GRANT SELECT, INSERT, UPDATE ON "classificacao" TO pz_sistema;
GRANT SELECT ON "classificacao" TO pz_leitura;
