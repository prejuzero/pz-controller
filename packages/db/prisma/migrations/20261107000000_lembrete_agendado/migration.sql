-- Lembretes de prazo agendados (HU31, PZ-196): a agenda materializada a partir das preferências e
-- das datas do motor (dias úteis antes do vencimento). Reprogramar cancela os futuros e grava os
-- novos; nada é apagado. O disparo pega os devidos com SKIP LOCKED (várias réplicas) e a
-- notificação tem chave de idempotência própria (HU30).
CREATE TYPE "situacao_lembrete" AS ENUM ('agendado', 'enviado', 'cancelado', 'dispensado');
CREATE TYPE "tipo_lembrete" AS ENUM ('antecedencia', 'insistencia');

CREATE TABLE "lembrete_agendado" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "prazo_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "tipo_lembrete" NOT NULL,
    "antecedencia" INTEGER NOT NULL,
    "vencimento" DATE NOT NULL,
    "disparo_em" TIMESTAMPTZ(6) NOT NULL,
    "situacao" "situacao_lembrete" NOT NULL DEFAULT 'agendado',
    "processado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lembrete_agendado_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lembrete_agendado_antecedencia" CHECK ("antecedencia" BETWEEN 0 AND 30)
);
ALTER TABLE "lembrete_agendado" ADD CONSTRAINT "lembrete_agendado_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "lembrete_agendado_tenant_id_prazo_id_idx" ON "lembrete_agendado"("tenant_id", "prazo_id");
-- Os devidos de todos os tenants (job global), só os ainda agendados.
CREATE INDEX "lembrete_agendado_devidos_idx" ON "lembrete_agendado"("disparo_em") WHERE "situacao" = 'agendado';
-- Um lembrete por prazo, usuário e instante entre os agendados (reprogramação concorrente).
CREATE UNIQUE INDEX "lembrete_agendado_unico_idx" ON "lembrete_agendado"("prazo_id", "usuario_id", "disparo_em") WHERE "situacao" = 'agendado';
SELECT pz_habilitar_rls('lembrete_agendado');
REVOKE DELETE ON "lembrete_agendado" FROM pz_app;
