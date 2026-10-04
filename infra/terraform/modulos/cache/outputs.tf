output "endpoint" {
  value = aws_elasticache_replication_group.principal.primary_endpoint_address
}

output "porta" {
  value = aws_elasticache_replication_group.principal.port
}
