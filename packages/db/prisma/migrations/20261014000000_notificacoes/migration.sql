-- Notificações multicanal (HU30, ADR-004, ADR-005). Cada envio é uma linha com chave de
-- idempotência única: a mesma notificação nunca sai duas vezes. A supressão (bounce e spam) é
-- global, sem tenant: um endereço que rejeitou não recebe de nenhum escritório.

CREATE TYPE "canal_notificacao" AS ENUM ('email', 'push', 'whatsapp', 'sms');

CREATE TABLE "notificacao" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "prazo_id" UUID,
    "canal" "canal_notificacao" NOT NULL,
    "tipo" TEXT NOT NULL,
    "chave_idempotencia" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "versao_template" INTEGER NOT NULL,
    "destinatarios" TEXT[] NOT NULL,
    "dados" JSONB NOT NULL,
    "enviada_em" TIMESTAMPTZ(6),
    "entregue_em" TIMESTAMPTZ(6),
    "aberta_em" TIMESTAMPTZ(6),
    "rejeitada_em" TIMESTAMPTZ(6),
    "motivo_rejeicao" TEXT,
    "id_externo" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notificacao_chave_idempotencia_key" ON "notificacao"("chave_idempotencia");
CREATE INDEX "notificacao_tenant_id_usuario_id_criado_em_idx" ON "notificacao"("tenant_id", "usuario_id", "criado_em");
CREATE UNIQUE INDEX "notificacao_id_externo_key" ON "notificacao"("id_externo");
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "preferencia_notificacao" (
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "canal" "canal_notificacao" NOT NULL,
    "ativo" BOOLEAN NOT NULL,
    "horario_resumo" TIME,
    "antecedencias" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preferencia_notificacao_pkey" PRIMARY KEY ("usuario_id", "tipo", "canal")
);
CREATE INDEX "preferencia_notificacao_tenant_id_idx" ON "preferencia_notificacao"("tenant_id");
ALTER TABLE "preferencia_notificacao" ADD CONSTRAINT "preferencia_notificacao_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "supressao" (
    "email" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supressao_pkey" PRIMARY KEY ("email"),
    CONSTRAINT "supressao_motivo" CHECK ("motivo" IN ('bounce', 'spam')),
    CONSTRAINT "supressao_email_minusculo" CHECK ("email" = lower("email"))
);

SELECT pz_habilitar_rls('notificacao');
SELECT pz_habilitar_rls('preferencia_notificacao');
REVOKE DELETE ON "notificacao" FROM pz_app, pz_sistema;
-- Supressão: global, só leitura e inclusão pela aplicação (remoção é ação de suporte).
GRANT SELECT, INSERT ON "supressao" TO pz_app, pz_sistema;
GRANT SELECT ON "supressao" TO pz_leitura;
