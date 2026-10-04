output "endpoint" {
  value = aws_db_instance.principal.address
}

output "porta" {
  value = aws_db_instance.principal.port
}

output "segredo_usuario_mestre_arn" {
  description = "Segredo gerenciado pelo RDS com a senha do papel pz_migrator."
  value       = aws_db_instance.principal.master_user_secret[0].secret_arn
}
