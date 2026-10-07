-- Verificação do e-mail do usuário (HU11): preenchido quando o titular abre o link enviado no
-- cadastro. Nulo = ainda não verificado.
ALTER TABLE "usuario" ADD COLUMN "email_verificado_em" TIMESTAMPTZ(6);
