-- Reverte 20261123000000_clientes_oauth_publicos.
SET ROLE pz_credencial;
DROP FUNCTION pz_localizar_cliente_oauth(uuid);
CREATE FUNCTION pz_localizar_cliente_oauth(p_id uuid)
  RETURNS TABLE (
    tenant_id uuid, usuario_id uuid, segredo_hash text, escopos text[], revogado boolean,
    tenant_suspenso boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT c.tenant_id, c.usuario_id, c.segredo_hash, c.escopos, c.revogado_em IS NOT NULL,
               t.suspenso_em IS NOT NULL
          FROM cliente_oauth c JOIN tenant t ON t.id = c.tenant_id
         WHERE c.id = p_id $$;
REVOKE ALL ON FUNCTION pz_localizar_cliente_oauth(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_localizar_cliente_oauth(uuid) TO pz_app;
RESET ROLE;
REVOKE SELECT ("tipo", "redirect_uris") ON "cliente_oauth" FROM pz_credencial;

DROP INDEX "sessao_dispositivo_cliente_oauth_id_idx";
ALTER TABLE "sessao_dispositivo" DROP CONSTRAINT "sessao_dispositivo_cliente_oauth_id_fkey";
ALTER TABLE "sessao_dispositivo" DROP COLUMN "cliente_oauth_id";

-- Clientes públicos não cabem no esquema anterior (segredo obrigatório): saem antes.
DELETE FROM "cliente_oauth" WHERE "tipo" = 'publico';
ALTER TABLE "cliente_oauth" DROP CONSTRAINT "cliente_oauth_tipo";
ALTER TABLE "cliente_oauth" ALTER COLUMN "segredo_hash" SET NOT NULL;
ALTER TABLE "cliente_oauth" DROP COLUMN "redirect_uris";
ALTER TABLE "cliente_oauth" DROP COLUMN "tipo";
