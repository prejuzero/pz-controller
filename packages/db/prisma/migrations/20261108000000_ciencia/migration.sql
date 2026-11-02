-- Ciência dos prazos (HU33, PZ-203/204). Tokens dos links de e-mail: só o hash, uso único, 7 dias;
-- reemitir revoga os ativos do mesmo prazo e usuário. Estado da ciência por prazo, que só avança
-- (a regra está no módulo ciencia). Nada é apagado.
CREATE TYPE "estado_ciencia" AS ENUM ('nao_enviado', 'enviado', 'entregue', 'aberto', 'visualizado', 'confirmado', 'cumprido');

CREATE TABLE "token_ciencia" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "prazo_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "hash_token" TEXT NOT NULL,
    "expira_em" TIMESTAMPTZ(6) NOT NULL,
    "usado_em" TIMESTAMPTZ(6),
    "usado_ip" TEXT,
    "revogado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_ciencia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "token_ciencia_hash" CHECK ("hash_token" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "token_ciencia_hash_token_key" ON "token_ciencia"("hash_token");
CREATE INDEX "token_ciencia_tenant_id_prazo_id_usuario_id_idx" ON "token_ciencia"("tenant_id", "prazo_id", "usuario_id");
ALTER TABLE "token_ciencia" ADD CONSTRAINT "token_ciencia_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
SELECT pz_habilitar_rls('token_ciencia');
REVOKE DELETE ON "token_ciencia" FROM pz_app;

CREATE TABLE "ciencia_prazo" (
    "prazo_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "estado" "estado_ciencia" NOT NULL DEFAULT 'nao_enviado',
    "confirmada_por" UUID,
    "confirmada_em" TIMESTAMPTZ(6),
    "canal" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ciencia_prazo_pkey" PRIMARY KEY ("prazo_id"),
    CONSTRAINT "ciencia_prazo_confirmacao" CHECK (("confirmada_em" IS NULL) = ("confirmada_por" IS NULL))
);
CREATE INDEX "ciencia_prazo_tenant_id_estado_idx" ON "ciencia_prazo"("tenant_id", "estado");
ALTER TABLE "ciencia_prazo" ADD CONSTRAINT "ciencia_prazo_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
SELECT pz_habilitar_rls('ciencia_prazo');
REVOKE DELETE ON "ciencia_prazo" FROM pz_app;
