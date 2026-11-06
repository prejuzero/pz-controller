-- Resumo da publicação por IA (HU62, ADR-014/016): um por conteúdo global, gerado depois da
-- classificação. Sem tenant_id: o conteúdo é global; cada escritório vê o resumo só dos conteúdos
-- que recebeu (a rota confere pelo módulo publicacoes). Os trechos de evidência são cópia literal
-- do teor (conferidos no código); "revisao_manual" não é exibido.
CREATE TABLE "resumo_publicacao" (
    "conteudo_id" UUID NOT NULL,
    "situacao" TEXT NOT NULL,
    "texto" TEXT,
    "providencia" TEXT,
    "trechos" TEXT[] NOT NULL DEFAULT '{}',
    "modelo" TEXT,
    "versao_prompt" TEXT,
    "motivo" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resumo_publicacao_pkey" PRIMARY KEY ("conteudo_id"),
    CONSTRAINT "resumo_publicacao_situacao" CHECK ("situacao" IN ('ok', 'revisao_manual')),
    -- "ok" exige o texto e ao menos um trecho de evidência.
    CONSTRAINT "resumo_publicacao_ok_completo" CHECK (
      "situacao" <> 'ok' OR ("texto" IS NOT NULL AND cardinality("trechos") > 0)
    )
);

-- A aplicação grava (consumidor do evento) e lê; a curadoria revisa pelo papel sistema. Nada apaga.
GRANT SELECT, INSERT ON "resumo_publicacao" TO pz_app;
GRANT SELECT, INSERT, UPDATE ON "resumo_publicacao" TO pz_sistema;
GRANT SELECT ON "resumo_publicacao" TO pz_leitura;
