-- Exportação dos dados do titular e do escritório (HU38, LGPD art. 18).
CREATE TYPE "escopo_exportacao" AS ENUM ('titular', 'escritorio');
CREATE TYPE "situacao_exportacao" AS ENUM ('pendente', 'concluida');

CREATE TABLE "exportacao_dados" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "escopo" "escopo_exportacao" NOT NULL,
    "situacao" "situacao_exportacao" NOT NULL DEFAULT 'pendente',
    "solicitada_em" TIMESTAMPTZ(6) NOT NULL,
    "concluida_em" TIMESTAMPTZ(6),
    "expira_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exportacao_dados_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exportacao_dados_conclusao" CHECK (
      ("situacao" = 'concluida') = ("concluida_em" IS NOT NULL AND "expira_em" IS NOT NULL)
    )
);
CREATE INDEX "exportacao_dados_tenant_id_usuario_id_idx" ON "exportacao_dados"("tenant_id", "usuario_id");
-- Um pedido pendente por usuário e escopo.
CREATE UNIQUE INDEX "exportacao_dados_pendente_key" ON "exportacao_dados"("tenant_id", "usuario_id", "escopo")
  WHERE "situacao" = 'pendente';
ALTER TABLE "exportacao_dados" ADD CONSTRAINT "exportacao_dados_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
SELECT pz_habilitar_rls('exportacao_dados');

-- Dono do escritório exporta os dados do tenant (decisão do produto, 07/10/2026).
INSERT INTO "perfil_permissao" ("perfil", "permissao") VALUES
  ('admin_escritorio', 'escritorio:exportar'),
  ('advogado', 'escritorio:exportar');
