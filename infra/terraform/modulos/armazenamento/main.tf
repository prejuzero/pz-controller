# Buckets S3 (ADR-010): arquivos (PDFs de intimações), relatórios e cópia WORM da auditoria (ADR-006).
locals {
  buckets = {
    arquivos   = { worm = false, expirar_dias = 0 }
    relatorios = { worm = false, expirar_dias = var.retencao_relatorios_dias }
    auditoria  = { worm = true, expirar_dias = 0 }
  }
}

resource "aws_s3_bucket" "principal" {
  for_each            = local.buckets
  bucket              = "${var.nome}-${each.key}-${var.sufixo_unico}"
  object_lock_enabled = each.value.worm
  force_destroy       = false
}

resource "aws_s3_bucket_ownership_controls" "principal" {
  for_each = aws_s3_bucket.principal
  bucket   = each.value.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "principal" {
  for_each                = aws_s3_bucket.principal
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "principal" {
  for_each = aws_s3_bucket.principal
  bucket   = each.value.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "principal" {
  for_each = aws_s3_bucket.principal
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.chave_kms_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_logging" "principal" {
  for_each      = aws_s3_bucket.principal
  bucket        = each.value.id
  target_bucket = var.bucket_logs_acesso
  target_prefix = "s3/${each.key}/"
}

# Trilha de auditoria: ninguém apaga nem sobrescreve dentro do período de retenção (RNF14, RNF17).
resource "aws_s3_bucket_object_lock_configuration" "auditoria" {
  bucket = aws_s3_bucket.principal["auditoria"].id
  rule {
    default_retention {
      mode = "COMPLIANCE"
      days = var.retencao_auditoria_dias
    }
  }
  depends_on = [aws_s3_bucket_versioning.principal]
}

resource "aws_s3_bucket_lifecycle_configuration" "relatorios" {
  bucket = aws_s3_bucket.principal["relatorios"].id
  rule {
    id     = "expirar-relatorios"
    status = "Enabled"
    filter {}
    expiration {
      days = var.retencao_relatorios_dias
    }
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_iam_policy_document" "somente_tls" {
  for_each = aws_s3_bucket.principal
  statement {
    sid       = "NegarSemTLS"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [each.value.arn, "${each.value.arn}/*"]
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

resource "aws_s3_bucket_policy" "principal" {
  for_each   = aws_s3_bucket.principal
  bucket     = each.value.id
  policy     = data.aws_iam_policy_document.somente_tls[each.key].json
  depends_on = [aws_s3_bucket_public_access_block.principal]
}
