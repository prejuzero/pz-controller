output "balanceador_dns" {
  value = module.computacao.balanceador_dns
}

output "cluster" {
  value = module.computacao.cluster
}

output "repositorios" {
  value = module.computacao.repositorios
}

output "banco_endpoint" {
  value = module.banco.endpoint
}

output "cache_endpoint" {
  value = module.cache.endpoint
}

output "buckets" {
  value = module.armazenamento.buckets
}

output "segredo_configuracao_arn" {
  value = module.segredos.segredo_configuracao_arn
}
