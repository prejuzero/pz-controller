-- Reverte 20261013000000_email_verificado.
ALTER TABLE "usuario" DROP COLUMN IF EXISTS "email_verificado_em";
