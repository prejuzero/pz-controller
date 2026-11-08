-- Reverte 20261128000000_alvo_por_nome_enum (depois do down de 20261128000001, que apaga os
-- alvos por nome). O Postgres não remove valor de enum: recria o tipo.
ALTER TABLE "alvo_monitoramento" DROP CONSTRAINT "alvo_monitoramento_valor";
ALTER TABLE "alvo_monitoramento" ALTER COLUMN "tipo" TYPE TEXT;
DROP TYPE "tipo_alvo";
CREATE TYPE "tipo_alvo" AS ENUM ('oab', 'processo');
ALTER TABLE "alvo_monitoramento" ALTER COLUMN "tipo" TYPE "tipo_alvo" USING "tipo"::"tipo_alvo";
ALTER TABLE "alvo_monitoramento" ADD CONSTRAINT "alvo_monitoramento_valor" CHECK (
  ("tipo" = 'oab' AND "valor" ~ '^[0-9]{1,8}/[A-Z]{2}$')
  OR ("tipo" = 'processo' AND "valor" ~ '^[0-9]{20}$')
);
