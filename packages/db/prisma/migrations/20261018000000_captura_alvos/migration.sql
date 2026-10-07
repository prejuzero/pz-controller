-- Alvos de monitoramento da captura (HU17, ADR-014). O alvo é global: a mesma OAB ou processo
-- em N escritórios gera uma única consulta à fonte. Quem assina cada alvo fica por tenant (RLS).
CREATE TYPE "tipo_alvo" AS ENUM ('oab', 'processo');

CREATE TABLE "alvo_monitoramento" (
    "id" UUID NOT NULL,
    "tipo" "tipo_alvo" NOT NULL,
    -- OAB: "123456/SP"; processo: 20 dígitos do número CNJ.
    "valor" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_sucesso" TIMESTAMPTZ(6),
    -- Fim da última janela capturada com sucesso: a próxima começa um dia antes (sobreposição).
    "ultima_janela_fim" DATE,
    "ultima_chave" TEXT,
    "proxima_execucao" TIMESTAMPTZ(6),
    "falhas_consecutivas" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alvo_monitoramento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "alvo_monitoramento_valor" CHECK (
      ("tipo" = 'oab' AND "valor" ~ '^[0-9]{1,8}/[A-Z]{2}$')
      OR ("tipo" = 'processo' AND "valor" ~ '^[0-9]{20}$')
    ),
    CONSTRAINT "alvo_monitoramento_falhas" CHECK ("falhas_consecutivas" >= 0)
);
CREATE UNIQUE INDEX "alvo_monitoramento_tipo_valor_key" ON "alvo_monitoramento"("tipo", "valor");

CREATE TABLE "alvo_assinante" (
    "alvo_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    -- oab.id ou processo.id do tenant que pediu o monitoramento.
    "referencia" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alvo_assinante_pkey" PRIMARY KEY ("tenant_id", "alvo_id", "referencia")
);
CREATE INDEX "alvo_assinante_alvo_id_idx" ON "alvo_assinante"("alvo_id");

ALTER TABLE "alvo_assinante" ADD CONSTRAINT "alvo_assinante_alvo_id_fkey" FOREIGN KEY ("alvo_id") REFERENCES "alvo_monitoramento"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "alvo_assinante" ADD CONSTRAINT "alvo_assinante_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Global e sem dado de cliente: a aplicação cria o alvo no consumo do evento do tenant; o
-- planejamento e a execução (que atravessam tenants) usam o papel sistema.
GRANT SELECT, INSERT, UPDATE ON "alvo_monitoramento" TO pz_app, pz_sistema;
GRANT SELECT ON "alvo_monitoramento" TO pz_leitura;
SELECT pz_habilitar_rls('alvo_assinante');
