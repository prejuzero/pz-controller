-- Cadastro do advogado e OABs (HU11, ADR-003). O cadastro público cria o próprio tenant autônomo
-- pela api (pz_app), sem papel de sistema: a política RESTRICTIVE só deixa o pz_app inserir um
-- tenant `autonomo` cujo id é o do contexto da transação (o isolamento_tenant já exige isso).

GRANT INSERT ON "tenant" TO pz_app;
CREATE POLICY cadastro_autonomo ON "tenant" AS RESTRICTIVE FOR INSERT TO pz_app
  WITH CHECK (tipo = 'autonomo');

-- CreateEnum
CREATE TYPE "tipo_oab" AS ENUM ('principal', 'suplementar');

-- CreateTable
CREATE TABLE "advogado" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" CHAR(11) NOT NULL,
    "celular" TEXT NOT NULL,
    "emails_adicionais" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advogado_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "advogado_cpf_digitos" CHECK ("cpf" ~ '^[0-9]{11}$')
);

CREATE TABLE "oab" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "advogado_id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "tipo" "tipo_oab" NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "removida_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oab_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "oab_remocao" CHECK ("ativa" = ("removida_em" IS NULL))
);

-- Um advogado por usuário e por CPF; uma OAB ativa pertence a um só advogado em toda a base
-- (RF02): o índice vale entre tenants, mesmo sem o RLS deixar ver a linha do outro.
CREATE UNIQUE INDEX "advogado_usuario_id_key" ON "advogado"("usuario_id");
CREATE UNIQUE INDEX "advogado_cpf_key" ON "advogado"("cpf");
CREATE INDEX "advogado_tenant_id_idx" ON "advogado"("tenant_id");
CREATE UNIQUE INDEX "oab_ativa_numero_uf_key" ON "oab"("numero", "uf") WHERE "ativa";
CREATE UNIQUE INDEX "oab_principal_por_advogado_key" ON "oab"("advogado_id")
  WHERE "ativa" AND "tipo" = 'principal';
CREATE INDEX "oab_tenant_id_advogado_id_idx" ON "oab"("tenant_id", "advogado_id");

-- AddForeignKey
ALTER TABLE "advogado" ADD CONSTRAINT "advogado_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "advogado" ADD CONSTRAINT "advogado_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "oab" ADD CONSTRAINT "oab_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "oab" ADD CONSTRAINT "oab_advogado_id_fkey" FOREIGN KEY ("advogado_id") REFERENCES "advogado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (CLAUDE.md, seção 9). OAB não é apagada: remoção desativa e fica registrada.
SELECT pz_habilitar_rls('advogado');
SELECT pz_habilitar_rls('oab');
REVOKE DELETE ON "advogado", "oab" FROM pz_app, pz_sistema;
