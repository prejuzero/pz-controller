output "chave_kms_arn" {
  value = aws_kms_key.principal.arn
}

output "segredo_configuracao_arn" {
  value = aws_secretsmanager_secret.configuracao.arn
}
