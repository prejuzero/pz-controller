-- Clientes OAuth públicos (HU49, PR 3): Authorization Code + PKCE (OAuth 2.1) para apps e
-- assistentes que agem em nome de quem autoriza. Sem segredo (o PKCE prova a posse do pedido);
-- os endereços de retorno são cadastrados e comparados por igualdade exata.
ALTER TABLE "cliente_oauth" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'confidencial';
ALTER TABLE "cliente_oauth" ADD COLUMN "redirect_uris" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "cliente_oauth" ALTER COLUMN "segredo_hash" DROP NOT NULL;
ALTER TABLE "cliente_oauth" ADD CONSTRAINT "cliente_oauth_tipo" CHECK (
  ("tipo" = 'confidencial' AND "segredo_hash" IS NOT NULL)
  OR ("tipo" = 'publico' AND "segredo_hash" IS NULL AND cardinality("redirect_uris") > 0)
);

-- Sessão de dispositivo nascida de uma autorização: revogar o cliente derruba todas.
ALTER TABLE "sessao_dispositivo" ADD COLUMN "cliente_oauth_id" UUID;
ALTER TABLE "sessao_dispositivo" ADD CONSTRAINT "sessao_dispositivo_cliente_oauth_id_fkey" FOREIGN KEY ("cliente_oauth_id") REFERENCES "cliente_oauth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "sessao_dispositivo_cliente_oauth_id_idx" ON "sessao_dispositivo"("cliente_oauth_id");

-- O encerramento (HU38) apaga sessao_dispositivo antes de cliente_oauth: a FK não trava.

GRANT SELECT ("tipo", "redirect_uris") ON "cliente_oauth" TO pz_credencial;

-- O endpoint de token passa a saber o tipo e os endereços de retorno do cliente.
SET ROLE pz_credencial;
DROP FUNCTION pz_localizar_cliente_oauth(uuid);
CREATE FUNCTION pz_localizar_cliente_oauth(p_id uuid)
  RETURNS TABLE (
    tenant_id uuid, usuario_id uuid, segredo_hash text, escopos text[], revogado boolean,
    tenant_suspenso boolean, tipo text, redirect_uris text[]
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT c.tenant_id, c.usuario_id, c.segredo_hash, c.escopos, c.revogado_em IS NOT NULL,
               t.suspenso_em IS NOT NULL, c.tipo, c.redirect_uris
          FROM cliente_oauth c JOIN tenant t ON t.id = c.tenant_id
         WHERE c.id = p_id $$;
REVOKE ALL ON FUNCTION pz_localizar_cliente_oauth(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_localizar_cliente_oauth(uuid) TO pz_app;
RESET ROLE;
