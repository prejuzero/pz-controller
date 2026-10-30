-- Agregado Prazo (HU16, PZ-140; ADR-003, ADR-007). Um prazo por ato do processo, sugerido pelo
-- motor (ou informado pelo advogado) e só válido depois da confirmação humana (CLAUDE.md, seção 2).
-- Datas jurídicas em DATE; o fim do prazo (24h do vencimento no fuso do juízo) em timestamptz.
-- Nenhuma linha é apagada pela aplicação: cancelamento é estado.

-- CreateEnum
CREATE TYPE "origem_prazo" AS ENUM ('djen', 'manual', 'painel');
CREATE TYPE "status_prazo" AS ENUM ('a_confirmar', 'pendente', 'cumprido', 'vencido', 'cancelado');
CREATE TYPE "status_ciencia_prazo" AS ENUM ('pendente', 'confirmada');

-- CreateTable
CREATE TABLE "prazo" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "processo_id" UUID NOT NULL,
    -- Destinatário da publicação de origem (chave tenant_id + conteudo_id), quando houver.
    "publicacao_conteudo_id" UUID,
    "tipo_ato" TEXT NOT NULL,
    -- Nulo quando o ramo não foi informado nem é dedutível do processo ("a confirmar").
    "ramo" "ramo_processual",
    "dias" INTEGER,
    "unidade" "unidade_prazo",
    "inicio" DATE,
    "vencimento" DATE,
    "fim_do_prazo" TIMESTAMPTZ(6),
    "fuso_do_juizo" TEXT,
    -- Data informada pelo advogado, sem cálculo do motor (CLAUDE.md, seção 4.4).
    "vencimento_manual" BOOLEAN NOT NULL DEFAULT false,
    -- Memória de cálculo do motor, ou o motivo do "a confirmar" (CLAUDE.md, seção 4.4).
    "memoria_calculo" JSONB NOT NULL,
    -- Entrada do motor (sem o calendário): permite o recálculo quando o calendário muda.
    "entrada_calculo" JSONB,
    "fundamento" TEXT,
    "origem" "origem_prazo" NOT NULL,
    "status" "status_prazo" NOT NULL DEFAULT 'a_confirmar',
    "status_ciencia" "status_ciencia_prazo" NOT NULL DEFAULT 'pendente',
    "responsavel_id" UUID,
    "versao_motor" TEXT,
    "versao_tabela" INTEGER,
    -- Jurisdição usada no calendário (tribunal, uf, comarca) e lacunas.
    "jurisdicao" JSONB NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versao_otimista" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "prazo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prazo_versao_otimista" CHECK ("versao_otimista" >= 1),
    CONSTRAINT "prazo_dias_positivos" CHECK ("dias" IS NULL OR "dias" > 0),
    -- Só "a confirmar" e "cancelado" podem ficar sem vencimento.
    CONSTRAINT "prazo_vencimento_definido" CHECK (
      "status" IN ('a_confirmar', 'cancelado') OR "vencimento" IS NOT NULL
    ),
    CONSTRAINT "prazo_periodo" CHECK ("inicio" IS NULL OR "vencimento" IS NULL OR "vencimento" >= "inicio")
);

-- CreateIndex
CREATE INDEX "prazo_tenant_id_vencimento_idx" ON "prazo"("tenant_id", "vencimento");
CREATE INDEX "prazo_tenant_id_status_idx" ON "prazo"("tenant_id", "status");
CREATE INDEX "prazo_tenant_id_responsavel_id_vencimento_idx" ON "prazo"("tenant_id", "responsavel_id", "vencimento");
CREATE INDEX "prazo_tenant_id_processo_id_idx" ON "prazo"("tenant_id", "processo_id");

-- AddForeignKey
ALTER TABLE "prazo" ADD CONSTRAINT "prazo_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prazo" ADD CONSTRAINT "prazo_tenant_id_processo_id_fkey" FOREIGN KEY ("tenant_id", "processo_id") REFERENCES "processo"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Isolamento por tenant (ADR-003); DELETE nunca pela aplicação (cancelamento é estado).
SELECT pz_habilitar_rls('prazo');
REVOKE DELETE ON "prazo" FROM pz_app, pz_sistema;

-- O encerramento de conta (HU38) passa a apagar os prazos do tenant.
CREATE OR REPLACE FUNCTION pz_efetivar_encerramento(p_tenant uuid) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant::text, true);
  IF NOT EXISTS (
    SELECT 1 FROM encerramento_conta
     WHERE tenant_id = p_tenant AND cancelado_em IS NULL AND efetivado_em IS NULL
       AND efetivar_em <= now()
  ) THEN
    RAISE EXCEPTION 'encerramento de % não está vencido, foi cancelado ou já foi efetivado', p_tenant
      USING ERRCODE = 'check_violation';
  END IF;

  -- Dados de negócio: apagados.
  DELETE FROM prazo WHERE tenant_id = p_tenant;
  DELETE FROM publicacao_destinatario WHERE tenant_id = p_tenant;
  DELETE FROM alvo_assinante WHERE tenant_id = p_tenant;
  DELETE FROM processo WHERE tenant_id = p_tenant;
  DELETE FROM cliente WHERE tenant_id = p_tenant;
  DELETE FROM oab WHERE tenant_id = p_tenant;
  DELETE FROM advogado WHERE tenant_id = p_tenant;
  DELETE FROM preferencia_notificacao WHERE tenant_id = p_tenant;
  DELETE FROM destino_push WHERE tenant_id = p_tenant;
  DELETE FROM sessao_dispositivo WHERE tenant_id = p_tenant;
  DELETE FROM usuario_perfil WHERE tenant_id = p_tenant;
  DELETE FROM exportacao_dados WHERE tenant_id = p_tenant;
  DELETE FROM evento_processado WHERE tenant_id = p_tenant;
  DELETE FROM evento_dominio WHERE tenant_id = p_tenant;

  -- Provas: mantidas até o fim da retenção, sem dado pessoal.
  UPDATE acesso SET ip = 'pseudonimizado', user_agent = 'pseudonimizado' WHERE tenant_id = p_tenant;
  UPDATE aceite_documento SET ip = 'pseudonimizado', user_agent = 'pseudonimizado' WHERE tenant_id = p_tenant;
  UPDATE notificacao SET destinatarios = '{}', dados = '{}'::jsonb WHERE tenant_id = p_tenant;
  UPDATE consentimento_canal SET destino = 'pseudonimizado' WHERE tenant_id = p_tenant;
  UPDATE auditoria_dado_pessoal SET valor = NULL, sal = NULL, pseudonimizado_em = now()
   WHERE tenant_id = p_tenant AND pseudonimizado_em IS NULL;
  UPDATE usuario
     SET nome = 'Usuário removido', email = 'removido-' || id || '@encerrado.invalid',
         senha_hash = NULL, totp_segredo_cifrado = NULL, totp_ativo_em = NULL,
         totp_ultimo_passo = NULL, codigos_recuperacao = '{}', email_verificado_em = NULL
   WHERE tenant_id = p_tenant;

  UPDATE tenant SET nome = 'Escritório encerrado', encerrado_em = now() WHERE id = p_tenant;
  UPDATE encerramento_conta SET efetivado_em = now() WHERE tenant_id = p_tenant;
END
$$;
