-- Termos, política de privacidade e cobertura com aceite versionado (HU38, LGPD).
CREATE TYPE "tipo_documento_legal" AS ENUM ('termos', 'privacidade', 'cobertura');

-- Global e só de inserção: versão publicada não muda (nova redação = nova versão).
CREATE TABLE "documento_legal" (
    "id" UUID NOT NULL,
    "tipo" "tipo_documento_legal" NOT NULL,
    "versao" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "publicado_em" TIMESTAMPTZ(6) NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_legal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documento_legal_versao" CHECK ("versao" ~ '^[0-9]+\.[0-9]+(\.[0-9]+)?$'),
    CONSTRAINT "documento_legal_conteudo" CHECK (length("conteudo") > 0)
);
CREATE UNIQUE INDEX "documento_legal_tipo_versao_key" ON "documento_legal"("tipo", "versao");
CREATE INDEX "documento_legal_tipo_publicado_em_idx" ON "documento_legal"("tipo", "publicado_em");

-- Aceite do usuário, no tenant dele (RLS); IP e navegador como prova do aceite.
CREATE TABLE "aceite_documento" (
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "aceito_em" TIMESTAMPTZ(6) NOT NULL,
    "ip" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceite_documento_pkey" PRIMARY KEY ("tenant_id", "usuario_id", "documento_id")
);
ALTER TABLE "aceite_documento" ADD CONSTRAINT "aceite_documento_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "aceite_documento" ADD CONSTRAINT "aceite_documento_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documento_legal"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

GRANT SELECT ON "documento_legal" TO pz_app, pz_leitura;
GRANT SELECT, INSERT ON "documento_legal" TO pz_sistema;
SELECT pz_habilitar_rls('aceite_documento');
-- Aceite é prova: ninguém altera nem apaga pela aplicação ou pelo sistema. A exclusão do
-- titular (PZ-224) pseudonimiza por rotina própria, sem reabrir UPDATE geral.
REVOKE UPDATE, DELETE ON "aceite_documento" FROM pz_app, pz_sistema;
