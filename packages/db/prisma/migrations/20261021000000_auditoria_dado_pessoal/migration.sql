-- Dados pessoais da trilha fora do hash da cadeia (ADR-018, HU38): pseudonimizáveis sem
-- invalidar a cadeia do ADR-006.
CREATE TABLE "auditoria_dado_pessoal" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    -- Titular a quem o dado se refere, quando conhecido (IP e navegador: o autor da ação).
    "usuario_id" UUID,
    "campo" TEXT NOT NULL,
    "valor" TEXT,
    "sal" TEXT,
    -- SHA-256(sal || valor) em hex: permanece após a pseudonimização.
    "compromisso" TEXT NOT NULL,
    "pseudonimizado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_dado_pessoal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auditoria_dado_pessoal_compromisso" CHECK ("compromisso" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "auditoria_dado_pessoal_estado" CHECK (
      ("pseudonimizado_em" IS NULL AND "valor" IS NOT NULL AND "sal" IS NOT NULL)
      OR ("pseudonimizado_em" IS NOT NULL AND "valor" IS NULL AND "sal" IS NULL)
    )
);
CREATE INDEX "auditoria_dado_pessoal_tenant_id_usuario_id_idx" ON "auditoria_dado_pessoal"("tenant_id", "usuario_id");
ALTER TABLE "auditoria_dado_pessoal" ADD CONSTRAINT "auditoria_dado_pessoal_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
SELECT pz_habilitar_rls('auditoria_dado_pessoal');

-- Aplicação só insere e lê; só o sistema pseudonimiza, e só apagando valor e sal.
REVOKE UPDATE, DELETE, TRUNCATE ON "auditoria_dado_pessoal" FROM pz_app, pz_sistema, pz_leitura;
GRANT UPDATE ("valor", "sal", "pseudonimizado_em") ON "auditoria_dado_pessoal" TO pz_sistema;

CREATE FUNCTION pz_auditoria_dado_pessoal_so_pseudonimiza() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.campo <> OLD.campo OR NEW.compromisso <> OLD.compromisso OR NEW.criado_em <> OLD.criado_em
     OR NEW.valor IS NOT NULL OR NEW.sal IS NOT NULL OR OLD.pseudonimizado_em IS NOT NULL THEN
    RAISE EXCEPTION 'auditoria_dado_pessoal: só a pseudonimização (valor e sal para nulo) é permitida'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "auditoria_dado_pessoal_so_pseudonimiza" BEFORE UPDATE ON "auditoria_dado_pessoal"
  FOR EACH ROW EXECUTE FUNCTION pz_auditoria_dado_pessoal_so_pseudonimiza();

-- Referências dos dados pessoais do evento (campo -> id); entram no hash quando presentes.
ALTER TABLE "evento_auditoria" ADD COLUMN "dados_pessoais" JSONB;
