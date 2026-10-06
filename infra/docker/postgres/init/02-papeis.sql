-- Papéis do banco (ADR-003, HU05). Só para desenvolvimento local: na AWS os papéis e as
-- senhas vêm do Terraform e do Secrets Manager (HU72). Senhas abaixo são apenas locais.
--   pz_migrator  DDL: dono do schema, roda as migrações
--   pz_app       DML da aplicação, SEM BYPASSRLS: só enxerga o tenant da transação
--   pz_sistema   jobs globais (relay do outbox, captura), COM BYPASSRLS: uso explícito e auditado
--   pz_leitura   somente leitura (relatórios, réplica), sujeito ao RLS
CREATE ROLE pz_migrator LOGIN PASSWORD 'pz_migrator_local'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE pz_app LOGIN PASSWORD 'pz_app_local'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE pz_sistema LOGIN PASSWORD 'pz_sistema_local'
  NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
CREATE ROLE pz_leitura LOGIN PASSWORD 'pz_leitura_local'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
-- Dono da função de login (HU06): sem login e sem BYPASSRLS; lê só as colunas da credencial
-- por uma política própria. O migrador é membro SEM herança: pode transferir a função a ele,
-- mas não herda a leitura (continua isolado pelo RLS, como mostra a suíte de isolamento).
CREATE ROLE pz_credencial NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT pz_credencial TO pz_migrator WITH INHERIT FALSE, SET TRUE;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO pz_migrator, pz_app, pz_sistema, pz_leitura',
    current_database());
END $$;

GRANT USAGE, CREATE ON SCHEMA public TO pz_migrator;
GRANT USAGE ON SCHEMA public TO pz_app, pz_sistema, pz_leitura;
-- CREATE: exigido para ser dono da função de login (transferida pela migração).
GRANT USAGE, CREATE ON SCHEMA public TO pz_credencial;
-- pg_partman: o migrador cria e mantém partições (auditoria e publicações).
GRANT USAGE, CREATE ON SCHEMA partman TO pz_migrator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA partman TO pz_migrator;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA partman TO pz_migrator;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA partman TO pz_migrator;
