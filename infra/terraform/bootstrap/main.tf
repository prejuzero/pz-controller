# Bucket do estado remoto do Terraform. Aplicado uma única vez por conta, com estado local.
# Ver docs/runbooks/infraestrutura-aws.md.
provider "aws" {
  region = "sa-east-1"
  default_tags {
    tags = {
      projeto    = "prejuzero"
      gerenciado = "terraform-bootstrap"
    }
  }
}

data "aws_caller_identity" "atual" {}

resource "aws_kms_key" "estado" {
  description             = "PrejuZero: estado do Terraform"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

# O estado do Terraform não precisa de log de acesso próprio: o CloudTrail registra o acesso.
# trivy:ignore:AVD-AWS-0089
resource "aws_s3_bucket" "estado" {
  bucket = "pz-terraform-estado-${data.aws_caller_identity.atual.account_id}"
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "estado" {
  bucket                  = aws_s3_bucket.estado.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "estado" {
  bucket = aws_s3_bucket.estado.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "estado" {
  bucket = aws_s3_bucket.estado.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.estado.arn
    }
    bucket_key_enabled = true
  }
}

output "bucket_estado" {
  value = aws_s3_bucket.estado.bucket
}
