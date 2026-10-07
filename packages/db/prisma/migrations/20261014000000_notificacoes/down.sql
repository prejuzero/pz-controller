-- Reverte 20261014000000_notificacoes.
DROP TABLE IF EXISTS "supressao";
DROP TABLE IF EXISTS "preferencia_notificacao";
DROP TABLE IF EXISTS "notificacao";
DROP TYPE IF EXISTS "canal_notificacao";
