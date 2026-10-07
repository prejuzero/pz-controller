-- Consentimento por canal e destinos de push por dispositivo (HU30, ADR-015). Fora do e-mail,
-- nenhum canal envia sem consentimento ativo; revogar grava `revogado_em` (o histórico fica).

CREATE TYPE "plataforma_push" AS ENUM ('ios', 'android', 'web');

CREATE TABLE "consentimento_canal" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "canal" "canal_notificacao" NOT NULL,
    "destino" TEXT NOT NULL,
    "concedido_em" TIMESTAMPTZ(6) NOT NULL,
    "revogado_em" TIMESTAMPTZ(6),
    "origem" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consentimento_canal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consentimento_canal_origem" CHECK ("origem" IN ('portal', 'app', 'mcp', 'integrador')),
    CONSTRAINT "consentimento_canal_sem_email" CHECK ("canal" <> 'email')
);
-- Um consentimento ativo por usuário, canal e destino.
CREATE UNIQUE INDEX "consentimento_canal_ativo_key" ON "consentimento_canal"("usuario_id", "canal", "destino") WHERE "revogado_em" IS NULL;
CREATE INDEX "consentimento_canal_tenant_id_idx" ON "consentimento_canal"("tenant_id");
ALTER TABLE "consentimento_canal" ADD CONSTRAINT "consentimento_canal_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "destino_push" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "dispositivo_id" UUID NOT NULL,
    "plataforma" "plataforma_push" NOT NULL,
    "token" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "destino_push_pkey" PRIMARY KEY ("id")
);
-- Um destino por dispositivo (o token é atualizado quando o sistema do aparelho o troca).
CREATE UNIQUE INDEX "destino_push_dispositivo_id_key" ON "destino_push"("dispositivo_id");
CREATE INDEX "destino_push_tenant_id_usuario_id_idx" ON "destino_push"("tenant_id", "usuario_id");
ALTER TABLE "destino_push" ADD CONSTRAINT "destino_push_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

SELECT pz_habilitar_rls('consentimento_canal');
SELECT pz_habilitar_rls('destino_push');
-- Consentimento é prova (LGPD): sem DELETE, a revogação é um UPDATE de `revogado_em`.
REVOKE DELETE ON "consentimento_canal" FROM pz_app, pz_sistema;
