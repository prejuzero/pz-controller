output "grupo_seguranca_apps" {
  value = aws_security_group.apps.id
}

output "balanceador_dns" {
  value = aws_lb.principal.dns_name
}

output "balanceador_zona" {
  value = aws_lb.principal.zone_id
}

output "cluster" {
  value = aws_ecs_cluster.principal.name
}

output "repositorios" {
  value = { for chave, repo in aws_ecr_repository.app : chave => repo.repository_url }
}
