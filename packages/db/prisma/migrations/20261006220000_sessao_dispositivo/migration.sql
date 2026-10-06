-- Sessões por dispositivo (HU06, ADR-015): clientes que não são navegador (app, MCP,
-- integrador) recebem token de acesso curto + token de renovação rotativo, revogáveis.

-- CreateEnum
CREATE TYPE "tipo_cliente" AS ENUM ('web', 'mobile', 'mcp', 'integrador');

-- CreateTable
CREATE TABLE "sessao_dispositivo" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo_cliente" "tipo_cliente" NOT NULL,
    "nome_dispositivo" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL,
    "ultimo_uso" TIMESTAMPTZ(6) NOT NULL,
    "revogada_em" TIMESTAMPTZ(6),

    CONSTRAINT "sessao_dispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessao_dispositivo_tenant_id_idx" ON "sessao_dispositivo"("tenant_id");
CREATE INDEX "sessao_dispositivo_usuario_id_idx" ON "sessao_dispositivo"("usuario_id");

-- AddForeignKey
ALTER TABLE "sessao_dispositivo" ADD CONSTRAINT "sessao_dispositivo_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessao_dispositivo" ADD CONSTRAINT "sessao_dispositivo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Isolamento por tenant (ADR-003).
SELECT pz_habilitar_rls('sessao_dispositivo');
