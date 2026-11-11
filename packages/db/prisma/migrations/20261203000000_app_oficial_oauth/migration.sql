-- App oficial do PrejuZero como cliente OAuth público (HU65, ADR-015; decisões do usuário em
-- 11/11/2026): um registro fixo, global, que reaproveita o fluxo do registro dinâmico (HU60).
-- Quando o advogado autoriza, o escritório dele ganha um cliente público ligado ao registro; a
-- sessão de dispositivo nasce do tipo "mobile". PKCE obrigatório e renovação rotativa com
-- detecção de reuso valem como em todo cliente público. Os endereços de retorno efetivos vêm de
-- APP_OAUTH_REDIRECT_URIS na api; o valor abaixo é o padrão (esquema do app, RFC 8252).
ALTER TABLE "registro_oauth_dinamico" ADD COLUMN "app_oficial" BOOLEAN NOT NULL DEFAULT false;
-- No máximo um app oficial.
CREATE UNIQUE INDEX "registro_oauth_dinamico_app_oficial_key" ON "registro_oauth_dinamico"("app_oficial")
  WHERE "app_oficial";

-- O id é o client_id do app, o mesmo de CLIENTE_OAUTH_DO_APP em @pz/contracts.
INSERT INTO "registro_oauth_dinamico" ("id", "nome", "redirect_uris", "app_oficial")
VALUES ('019a0000-0000-7000-8000-00000000a990', 'PrejuZero (app)',
        ARRAY['br.com.prejuzero.app:/oauth/retorno'], true);
