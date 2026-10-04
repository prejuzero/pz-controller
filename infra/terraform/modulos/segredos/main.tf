# Chave KMS do ambiente e segredo de configuração das apps (ADR-010, RNF05).
# Os valores do segredo são gravados fora do Terraform (nunca no estado nem no repositório).
data "aws_caller_identity" "atual" {}
data "aws_region" "atual" {}

data "aws_iam_policy_document" "chave" {
  statement {
    sid       = "AdministracaoDaConta"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.atual.account_id}:root"]
    }
  }

  statement {
    sid = "LogsDoCloudWatch"
    actions = [
      "kms:Encrypt*",
      "kms:Decrypt*",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:Describe*",
    ]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${data.aws_region.atual.region}.amazonaws.com"]
    }
  }
}

resource "aws_kms_key" "principal" {
  description             = "PrejuZero ${var.nome}: dados em repouso"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.chave.json
}

resource "aws_kms_alias" "principal" {
  name          = "alias/${var.nome}"
  target_key_id = aws_kms_key.principal.key_id
}

resource "aws_secretsmanager_secret" "configuracao" {
  name        = "${var.nome}/configuracao-apps"
  description = "Variáveis sensíveis das apps (JSON). Preenchido fora do Terraform."
  kms_key_id  = aws_kms_key.principal.arn
}
