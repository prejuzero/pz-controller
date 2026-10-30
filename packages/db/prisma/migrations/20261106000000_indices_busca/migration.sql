-- Índices da busca avançada e da busca rápida (HU28, PZ-182). O teor já tem GIN em
-- `publicacao_conteudo.teor_tsv` (portugues_sem_acento); aqui entram o órgão por trigrama e os
-- compostos por tenant + data alvo e por status de ciência. O número CNJ parcial não tem trigrama
-- (a coluna é CHAR(20), que o gin_trgm_ops não aceita): a busca corre dentro do tenant, pelo
-- índice único (tenant_id, numero_cnj).
CREATE INDEX "processo_orgao_trgm_idx" ON "processo" USING GIN ("orgao" gin_trgm_ops);
CREATE INDEX "processo_tenant_id_tribunal_idx" ON "processo"("tenant_id", "tribunal");
CREATE INDEX "prazo_tenant_id_inicio_idx" ON "prazo"("tenant_id", "inicio");
CREATE INDEX "prazo_tenant_id_status_ciencia_vencimento_idx" ON "prazo"("tenant_id", "status_ciencia", "vencimento");
CREATE INDEX "publicacao_destinatario_tenant_id_oab_id_idx" ON "publicacao_destinatario"("tenant_id", "oab_id");
-- Ordem da busca de publicações (disponibilização, id) sem ordenar a tabela inteira.
CREATE INDEX "publicacao_conteudo_data_disponibilizacao_id_idx" ON "publicacao_conteudo"("data_disponibilizacao", "id");
