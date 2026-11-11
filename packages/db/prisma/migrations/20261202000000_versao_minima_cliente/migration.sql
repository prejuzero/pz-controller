-- Versão mínima de cliente por plataforma (HU63, PZ-261): abaixo dela, a API responde 426.
-- Global (sem tenant_id): vale para todos os escritórios. Mudar a versão é um UPDATE, sem
-- deploy; a API relê a tabela a cada minuto. Sem linha para a plataforma: nada é bloqueado.
CREATE TABLE "versao_minima_cliente" (
    "plataforma" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versao_minima_cliente_pkey" PRIMARY KEY ("plataforma"),
    CONSTRAINT "versao_minima_cliente_plataforma" CHECK ("plataforma" ~ '^[a-z][a-z0-9-]{0,19}$'),
    CONSTRAINT "versao_minima_cliente_versao" CHECK ("versao" ~ '^\d{1,4}\.\d{1,4}\.\d{1,4}$')
);

-- A api só lê; a versão muda por SQL do operador (papel de migração).
GRANT SELECT ON "versao_minima_cliente" TO pz_app;
GRANT SELECT ON "versao_minima_cliente" TO pz_leitura;
