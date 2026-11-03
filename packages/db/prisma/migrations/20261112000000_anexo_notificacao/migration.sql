-- Envio manual por e-mail (HU32, PZ-200): a notificação guarda a referência do anexo
-- (caminho no armazenamento do tenant, nome e tipo); o arquivo é lido no envio. Expand: coluna nula.
ALTER TABLE "notificacao" ADD COLUMN "anexo" JSONB;
