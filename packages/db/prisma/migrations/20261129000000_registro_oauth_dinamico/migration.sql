-- Registro dinâmico de clientes OAuth (HU60, RFC 7591; decisão do usuário em 08/11/2026): o
-- assistente (servidor MCP) se registra sozinho, antes de haver escritório. O registro é global
-- e não dá acesso a nada: só quando um advogado autoriza, o escritório dele ganha um cliente
-- público ligado ao registro, nos escopos de leitura que o advogado tem.
CREATE TABLE "registro_oauth_dinamico" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "redirect_uris" TEXT[] NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_oauth_dinamico_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "registro_oauth_dinamico_nome" CHECK (char_length("nome") BETWEEN 1 AND 100),
    CONSTRAINT "registro_oauth_dinamico_retorno" CHECK (cardinality("redirect_uris") BETWEEN 1 AND 5)
);
-- O registro é público (sem sessão): a aplicação só insere e lê.
GRANT SELECT, INSERT ON "registro_oauth_dinamico" TO pz_app;
GRANT SELECT ON "registro_oauth_dinamico" TO pz_sistema, pz_leitura;

ALTER TABLE "cliente_oauth" ADD COLUMN "registro_dinamico_id" UUID;
ALTER TABLE "cliente_oauth" ADD CONSTRAINT "cliente_oauth_registro_dinamico_id_fkey" FOREIGN KEY ("registro_dinamico_id") REFERENCES "registro_oauth_dinamico"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- Um cliente ativo por registro em cada escritório: as próximas autorizações o reaproveitam.
CREATE UNIQUE INDEX "cliente_oauth_registro_dinamico_key" ON "cliente_oauth"("tenant_id", "registro_dinamico_id")
  WHERE "registro_dinamico_id" IS NOT NULL AND "revogado_em" IS NULL;
