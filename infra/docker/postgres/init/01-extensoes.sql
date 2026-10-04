-- Extensões usadas pelo PrejuZero (ADR-010). Papéis e políticas RLS são criados pelas migrações (HU05).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE SCHEMA IF NOT EXISTS partman;
CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;
-- pgvector fica disponível, mas só é habilitado pela migração da funcionalidade que o usar (F2).
