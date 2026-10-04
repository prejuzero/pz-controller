# Compõe a infraestrutura completa de um ambiente do PrejuZero (ADR-010).
# Os ambientes (staging, produção) só escolhem tamanhos e opções.
data "aws_caller_identity" "atual" {}

module "segredos" {
  source = "../segredos"
  nome   = var.nome
}

module "rede" {
  source           = "../rede"
  nome             = var.nome
  cidr             = var.cidr
  quantidade_zonas = var.quantidade_zonas
  nat_por_zona     = var.nat_por_zona
  chave_kms_arn    = module.segredos.chave_kms_arn
}

# Logs de acesso do S3. O S3 só entrega esses logs em buckets com SSE-S3 (não aceita SSE-KMS).
# trivy:ignore:AVD-AWS-0089
resource "aws_s3_bucket" "logs_acesso" {
  bucket        = "${var.nome}-logs-acesso-${data.aws_caller_identity.atual.account_id}"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "logs_acesso" {
  bucket                  = aws_s3_bucket.logs_acesso.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "logs_acesso" {
  bucket = aws_s3_bucket.logs_acesso.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs_acesso" {
  bucket = aws_s3_bucket.logs_acesso.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs_acesso" {
  bucket = aws_s3_bucket.logs_acesso.id
  rule {
    id     = "expirar-logs"
    status = "Enabled"
    filter {}
    expiration {
      days = var.retencao_logs_dias
    }
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }
}

# Entrega de logs do balanceador (conta do Elastic Load Balancing em sa-east-1) e TLS obrigatório.
data "aws_iam_policy_document" "logs_acesso" {
  statement {
    sid       = "LogsDoBalanceador"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.logs_acesso.arn}/alb/AWSLogs/${data.aws_caller_identity.atual.account_id}/*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${var.conta_elb_regiao}:root"]
    }
  }

  statement {
    sid       = "NegarSemTLS"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.logs_acesso.arn, "${aws_s3_bucket.logs_acesso.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "logs_acesso" {
  bucket     = aws_s3_bucket.logs_acesso.id
  policy     = data.aws_iam_policy_document.logs_acesso.json
  depends_on = [aws_s3_bucket_public_access_block.logs_acesso]
}

module "armazenamento" {
  source                  = "../armazenamento"
  nome                    = var.nome
  sufixo_unico            = data.aws_caller_identity.atual.account_id
  chave_kms_arn           = module.segredos.chave_kms_arn
  bucket_logs_acesso      = aws_s3_bucket.logs_acesso.id
  retencao_auditoria_dias = var.retencao_auditoria_dias
}

module "computacao" {
  source             = "../computacao"
  nome               = var.nome
  vpc_id             = module.rede.vpc_id
  vpc_cidr           = module.rede.vpc_cidr
  subredes_publicas  = module.rede.subredes_publicas
  subredes_privadas  = module.rede.subredes_privadas
  chave_kms_arn      = module.segredos.chave_kms_arn
  certificado_arn    = var.certificado_arn
  segredos_arn       = [module.segredos.segredo_configuracao_arn]
  buckets_arn        = module.armazenamento.buckets_arn
  versao_imagem      = var.versao_imagem
  servicos           = var.servicos
  variaveis_ambiente = merge({ NODE_ENV = "production", TZ = "UTC" }, var.variaveis_ambiente)
  retencao_logs_dias = var.retencao_logs_dias
  protecao_exclusao  = var.protecao_exclusao
  bucket_logs_acesso = aws_s3_bucket.logs_acesso.id
}

module "banco" {
  source                  = "../banco"
  nome                    = var.nome
  vpc_id                  = module.rede.vpc_id
  subredes_privadas       = module.rede.subredes_privadas
  grupo_seguranca_apps    = module.computacao.grupo_seguranca_apps
  chave_kms_arn           = module.segredos.chave_kms_arn
  classe_instancia        = var.banco_classe
  multi_az                = var.banco_multi_az
  retencao_backup_dias    = var.banco_retencao_backup_dias
  protecao_exclusao       = var.protecao_exclusao
  armazenamento_gb        = var.banco_armazenamento_gb
  armazenamento_maximo_gb = var.banco_armazenamento_maximo_gb
}

module "cache" {
  source               = "../cache"
  nome                 = var.nome
  vpc_id               = module.rede.vpc_id
  subredes_privadas    = module.rede.subredes_privadas
  grupo_seguranca_apps = module.computacao.grupo_seguranca_apps
  chave_kms_arn        = module.segredos.chave_kms_arn
  tipo_no              = var.cache_tipo_no
  quantidade_nos       = var.cache_quantidade_nos
}
