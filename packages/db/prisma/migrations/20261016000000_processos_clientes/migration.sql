-- Processos e clientes (HU12, RF03 e RF91, ADR-003). Processo é único por número CNJ no tenant;
-- a ingestão o cria sozinha (obterOuCriarProcesso) e o advogado marca sigilo e cobertura.
-- CreateEnum
CREATE TYPE "cobertura_processo" AS ENUM ('automatica', 'parcial', 'manual');

-- CreateTable
CREATE TABLE "cliente" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processo" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "numero_cnj" CHAR(20) NOT NULL,
    "tribunal" TEXT,
    "ramo" TEXT,
    "orgao" TEXT,
    "comarca" TEXT,
    "sigiloso" BOOLEAN NOT NULL DEFAULT false,
    "cobertura" "cobertura_processo" NOT NULL DEFAULT 'automatica',
    "motivo_cobertura" TEXT,
    "cliente_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cliente_tenant_id_nome_idx" ON "cliente"("tenant_id", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_tenant_id_id_key" ON "cliente"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "processo_tenant_id_cliente_id_idx" ON "processo"("tenant_id", "cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "processo_tenant_id_numero_cnj_key" ON "processo"("tenant_id", "numero_cnj");

-- AddForeignKey
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processo" ADD CONSTRAINT "processo_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processo" ADD CONSTRAINT "processo_tenant_id_cliente_id_fkey" FOREIGN KEY ("tenant_id", "cliente_id") REFERENCES "cliente"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Formatos: número só com os 20 dígitos; documento CPF (11 dígitos) ou CNPJ (14, alfanumérico
-- pela IN RFB nº 2.229/2024); cobertura fora da automática sempre com motivo (RF91).
ALTER TABLE "processo" ADD CONSTRAINT "processo_numero_cnj_digitos" CHECK ("numero_cnj" ~ '^[0-9]{20}$');
ALTER TABLE "processo" ADD CONSTRAINT "processo_motivo_cobertura"
  CHECK (("cobertura" = 'automatica') = ("motivo_cobertura" IS NULL));
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_documento_formato"
  CHECK ("documento" IS NULL OR "documento" ~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$');

-- RLS (CLAUDE.md, seção 9). Processo não é apagado (a trilha e os prazos apontam para ele);
-- cliente sai só sem processos (a FK composta impede e também amarra o cliente ao mesmo tenant).
SELECT pz_habilitar_rls('cliente');
SELECT pz_habilitar_rls('processo');
REVOKE DELETE ON "processo" FROM pz_app, pz_sistema;

-- Permissões novas (HU12): o catálogo em código é a fonte; os perfis do banco as combinam.
INSERT INTO "perfil_permissao" ("perfil", "permissao") VALUES
  ('advogado', 'processos:ler'),
  ('advogado', 'processos:gerir'),
  ('admin_escritorio', 'processos:ler'),
  ('admin_escritorio', 'processos:gerir'),
  ('colaborador', 'processos:ler');
