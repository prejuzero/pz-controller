-- Trilha de auditoria imutável (HU08, ADR-006): só INSERT; cadeia por tenant com SHA-256 sobre
-- JSON canônico (RFC 8785), sequência serializada por advisory lock, horário do banco.
-- Particionada por mês (pg_partman, 3 meses à frente). UNIQUE (tenant_id, sequencia) não é
-- possível numa tabela particionada sem a chave de partição: a unicidade vem da serialização
-- por tenant e é conferida pelo verificador de integridade.

-- CreateTable
CREATE TABLE "evento_auditoria" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sequencia" BIGINT NOT NULL,
    "tipo" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT NOT NULL,
    "usuario_id" UUID,
    "usuario_real_id" UUID,
    "canal" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "antes" JSONB,
    "depois" JSONB,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hash_anterior" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "evento_auditoria_pkey" PRIMARY KEY ("id", "criado_em")
) PARTITION BY RANGE ("criado_em");

-- CreateIndex
CREATE INDEX "evento_auditoria_entidade_idx" ON "evento_auditoria"("tenant_id", "entidade", "entidade_id", "criado_em");
CREATE INDEX "evento_auditoria_sequencia_idx" ON "evento_auditoria"("tenant_id", "sequencia");

-- AddForeignKey
ALTER TABLE "evento_auditoria" ADD CONSTRAINT "evento_auditoria_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partições mensais, 3 meses à frente, mais a partição padrão (nada se perde fora do intervalo).
SELECT partman.create_parent(
  p_parent_table := 'public.evento_auditoria',
  p_control := 'criado_em',
  p_interval := '1 month',
  p_premake := 3
);

-- Isolamento por tenant (ADR-003) e, por cima, imutabilidade: nenhum papel da aplicação altera,
-- apaga ou trunca. As partições não recebem permissão: só se acessa pela tabela-mãe.
SELECT pz_habilitar_rls('evento_auditoria');
REVOKE UPDATE, DELETE, TRUNCATE ON "evento_auditoria" FROM pz_app, pz_sistema, pz_leitura;

CREATE FUNCTION pz_auditoria_imutavel() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'evento_auditoria é imutável (ADR-006): % não permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TRIGGER "evento_auditoria_imutavel" BEFORE UPDATE OR DELETE ON "evento_auditoria"
  FOR EACH ROW EXECUTE FUNCTION pz_auditoria_imutavel();
CREATE TRIGGER "evento_auditoria_sem_truncate" BEFORE TRUNCATE ON "evento_auditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION pz_auditoria_imutavel();
