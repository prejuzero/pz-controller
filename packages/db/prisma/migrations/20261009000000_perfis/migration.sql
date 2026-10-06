-- Perfis e permissões (HU07, ADR-003). O catálogo de permissões vive no código (fonte única,
-- módulo identidade); aqui ficam os perfis e o que cada um concede. Perfis são globais e só mudam
-- por migração; a atribuição a usuários é por tenant, com RLS. Perfil novo não muda endpoints.

-- CreateTable
CREATE TABLE "perfil" (
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfil_pkey" PRIMARY KEY ("codigo"),
    CONSTRAINT "perfil_codigo_formato" CHECK ("codigo" ~ '^[a-z]+(_[a-z]+)*$')
);

-- CreateTable
CREATE TABLE "perfil_permissao" (
    "perfil" TEXT NOT NULL,
    "permissao" TEXT NOT NULL,

    CONSTRAINT "perfil_permissao_pkey" PRIMARY KEY ("perfil", "permissao"),
    CONSTRAINT "perfil_permissao_formato" CHECK ("permissao" ~ '^[a-z]+(-[a-z]+)*:[a-z]+(-[a-z]+)*$')
);

-- CreateTable
CREATE TABLE "usuario_perfil" (
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "perfil" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_perfil_pkey" PRIMARY KEY ("usuario_id", "perfil")
);

-- CreateIndex
CREATE INDEX "usuario_perfil_tenant_id_idx" ON "usuario_perfil"("tenant_id");

-- AddForeignKey
ALTER TABLE "perfil_permissao" ADD CONSTRAINT "perfil_permissao_perfil_fkey" FOREIGN KEY ("perfil") REFERENCES "perfil"("codigo") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "usuario_perfil" ADD CONSTRAINT "usuario_perfil_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usuario_perfil" ADD CONSTRAINT "usuario_perfil_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usuario_perfil" ADD CONSTRAINT "usuario_perfil_perfil_fkey" FOREIGN KEY ("perfil") REFERENCES "perfil"("codigo") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Isolamento por tenant (ADR-003).
SELECT pz_habilitar_rls('usuario_perfil');

-- admin_plataforma só existe no tenant plataforma: nenhum escritório ganha acesso administrativo.
-- O tenant da linha é o da transação (RLS), então a própria linha de tenant fica visível.
CREATE FUNCTION pz_usuario_perfil_valido() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.perfil = 'admin_plataforma'
     AND NOT EXISTS (SELECT 1 FROM tenant WHERE id = NEW.tenant_id AND tipo = 'plataforma') THEN
    RAISE EXCEPTION 'usuario_perfil: admin_plataforma só pode ser atribuído no tenant plataforma'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "usuario_perfil_valido" BEFORE INSERT OR UPDATE ON "usuario_perfil"
  FOR EACH ROW EXECUTE FUNCTION pz_usuario_perfil_valido();

-- Perfis do MVP (advogado, admin_plataforma) e da F2, já modelados (admin_escritorio, colaborador).
INSERT INTO "perfil" ("codigo", "nome", "descricao") VALUES
  ('advogado', 'Advogado', 'Dono do tenant: acesso completo aos dados do próprio escritório.'),
  ('admin_plataforma', 'Administrador da plataforma', 'Equipe PrejuZero: administração; dados de tenant só por impersonação.'),
  ('admin_escritorio', 'Administrador do escritório', 'F2: acesso completo ao escritório e gestão de usuários.'),
  ('colaborador', 'Colaborador', 'F2: consulta prazos e publicações do escritório.');

INSERT INTO "perfil_permissao" ("perfil", "permissao") VALUES
  ('advogado', 'conta:gerir'),
  ('advogado', 'prazos:ler'),
  ('advogado', 'prazos:confirmar'),
  ('advogado', 'prazos:ajustar'),
  ('advogado', 'publicacoes:ler'),
  ('advogado', 'calendario:ler'),
  ('advogado', 'calendario:gerir'),
  ('advogado', 'relatorios:exportar'),
  ('admin_plataforma', 'conta:gerir'),
  ('admin_plataforma', 'admin:tenants'),
  ('admin_plataforma', 'admin:impersonar'),
  ('admin_plataforma', 'admin:filas'),
  ('admin_escritorio', 'conta:gerir'),
  ('admin_escritorio', 'prazos:ler'),
  ('admin_escritorio', 'prazos:confirmar'),
  ('admin_escritorio', 'prazos:ajustar'),
  ('admin_escritorio', 'publicacoes:ler'),
  ('admin_escritorio', 'calendario:ler'),
  ('admin_escritorio', 'calendario:gerir'),
  ('admin_escritorio', 'relatorios:exportar'),
  ('admin_escritorio', 'usuarios:gerir'),
  ('colaborador', 'conta:gerir'),
  ('colaborador', 'prazos:ler'),
  ('colaborador', 'publicacoes:ler'),
  ('colaborador', 'calendario:ler');

-- Usuários já existentes nos escritórios viram advogado (dono). Com RLS forçado e sem
-- BYPASSRLS, o migrador entra no contexto de cada tenant.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM tenant WHERE tipo <> 'plataforma' LOOP
    PERFORM set_config('app.tenant_id', t.id::text, true);
    INSERT INTO usuario_perfil (tenant_id, usuario_id, perfil)
      SELECT tenant_id, id, 'advogado' FROM usuario WHERE tenant_id = t.id
      ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$$;

-- Globais (ADR-003): a aplicação só lê; perfil novo entra por migração.
GRANT SELECT ON "perfil", "perfil_permissao" TO pz_app, pz_sistema, pz_leitura;
