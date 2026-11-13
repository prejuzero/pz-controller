-- "Buscar agora" e próxima rodada da captura (HU17): colunas novas, anuláveis (expand).
-- Último pedido de busca manual do alvo: intervalo mínimo entre pedidos, valendo para todos os
-- escritórios da OAB (o alvo é global).
ALTER TABLE "alvo_monitoramento" ADD COLUMN "busca_solicitada_em" TIMESTAMPTZ(6);

-- Próxima rodada agendada da captura, gravada pelo worker (o portal mostra ao escritório).
ALTER TABLE "fonte_captura" ADD COLUMN "proxima_rodada" TIMESTAMPTZ(6);
