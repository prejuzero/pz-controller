-- Registro de acessos (HU06, RNF05): login, 2FA, logout e bloqueios de cada usuário, para a tela
-- de últimos acessos e investigação. IP e user agent são dados pessoais (LGPD): só para segurança.

-- CreateEnum
CREATE TYPE "tipo_acesso" AS ENUM ('login', 'segundo-fator', 'logout', 'bloqueio');

-- CreateTable
CREATE TABLE "acesso" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "tipo_acesso" NOT NULL,
    "sucesso" BOOLEAN NOT NULL,
    "ip" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "ocorrido_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "acesso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "acesso_tenant_id_idx" ON "acesso"("tenant_id");
CREATE INDEX "acesso_usuario_id_ocorrido_em_idx" ON "acesso"("usuario_id", "ocorrido_em" DESC);

-- AddForeignKey
ALTER TABLE "acesso" ADD CONSTRAINT "acesso_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acesso" ADD CONSTRAINT "acesso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Isolamento por tenant (ADR-003).
SELECT pz_habilitar_rls('acesso');
