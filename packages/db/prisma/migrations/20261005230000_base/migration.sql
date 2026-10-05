-- HU05 · Schema base, multi-tenancy com RLS e outbox (ADR-003, ADR-004).
-- Roda como pz_migrator. Reversão: down.sql (CI aplica sobe → desce → sobe).

-- Tenant da transação atual. NULLIF: sem contexto (ou contexto limpo) vira NULL e nenhuma
-- linha passa na política; um valor que não é UUID faz a consulta falhar (nunca vaza dados).
CREATE FUNCTION pz_tenant_atual() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

-- Helper obrigatório para toda tabela com tenant_id (CLAUDE.md, seção 9): RLS ligado e forçado
-- (vale também para o dono da tabela), política de leitura e escrita pelo tenant e permissões
-- dos papéis. O teste de integração falha se alguma tabela com tenant_id ficar sem isso.
CREATE FUNCTION pz_habilitar_rls(tabela regclass) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tabela);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tabela);
  EXECUTE format(
    'CREATE POLICY isolamento_tenant ON %s USING (tenant_id = pz_tenant_atual()) '
    'WITH CHECK (tenant_id = pz_tenant_atual())', tabela);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO pz_app, pz_sistema', tabela);
  EXECUTE format('GRANT SELECT ON %s TO pz_leitura', tabela);
END
$$;
REVOKE EXECUTE ON FUNCTION pz_habilitar_rls(regclass) FROM PUBLIC;

-- CreateEnum
CREATE TYPE "tipo_tenant" AS ENUM ('autonomo', 'escritorio');

-- CreateTable
CREATE TABLE "tenant" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "tipo_tenant" NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_dominio" (
    "id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "tenant_id" UUID NOT NULL,
    "agregado_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "contexto" JSONB,
    "ocorrido_em" TIMESTAMPTZ(6) NOT NULL,
    "publicado_em" TIMESTAMPTZ(6),
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_dominio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_processado" (
    "consumidor" TEXT NOT NULL,
    "evento_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "processado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_processado_pkey" PRIMARY KEY ("consumidor","evento_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_tenant_id_email_key" ON "usuario"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "evento_dominio_tenant_id_idx" ON "evento_dominio"("tenant_id");

-- CreateIndex
CREATE INDEX "evento_processado_tenant_id_idx" ON "evento_processado"("tenant_id");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_dominio" ADD CONSTRAINT "evento_dominio_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_processado" ADD CONSTRAINT "evento_processado_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Relay do outbox: varre só os pendentes, na ordem de gravação (HU10).
CREATE INDEX "evento_dominio_pendentes_idx" ON "evento_dominio"("criado_em") WHERE "publicado_em" IS NULL;

-- Isolamento por tenant (ADR-003).
SELECT pz_habilitar_rls('usuario');
SELECT pz_habilitar_rls('evento_dominio');
SELECT pz_habilitar_rls('evento_processado');

-- A própria tabela tenant: cada tenant só enxerga a si mesmo. Criar tenants é tarefa do
-- cliente "sistema" (cadastro, HU06); a aplicação só lê e atualiza o seu.
ALTER TABLE "tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY isolamento_tenant ON "tenant"
  USING (id = pz_tenant_atual()) WITH CHECK (id = pz_tenant_atual());
GRANT SELECT, UPDATE ON "tenant" TO pz_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant" TO pz_sistema;
GRANT SELECT ON "tenant" TO pz_leitura;

-- Busca textual em português sem acento (publicações, processos).
CREATE TEXT SEARCH CONFIGURATION portugues_sem_acento (COPY = portuguese);
ALTER TEXT SEARCH CONFIGURATION portugues_sem_acento
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;
