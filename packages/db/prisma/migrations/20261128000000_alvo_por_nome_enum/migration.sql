-- Monitoramento por nome do escritório (HU42, RF05). Migração própria: o Postgres não deixa usar
-- um valor novo de enum na mesma transação que o cria.
ALTER TYPE "tipo_alvo" ADD VALUE 'nome';
