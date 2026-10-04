# Redis gerenciado para filas BullMQ e sessões (ADR-010): privado, criptografado e com TLS.
resource "aws_elasticache_subnet_group" "principal" {
  name       = "${var.nome}-cache"
  subnet_ids = var.subredes_privadas
}

resource "aws_security_group" "cache" {
  name        = "${var.nome}-cache"
  description = "Redis acessivel apenas pelas apps"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "cache_apps" {
  security_group_id            = aws_security_group.cache.id
  description                  = "Redis a partir das apps"
  referenced_security_group_id = var.grupo_seguranca_apps
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
}

resource "aws_elasticache_replication_group" "principal" {
  replication_group_id = "${var.nome}-redis"
  description          = "PrejuZero ${var.nome}: filas e sessoes"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.tipo_no
  port                 = 6379

  num_cache_clusters         = var.quantidade_nos
  automatic_failover_enabled = var.quantidade_nos > 1
  multi_az_enabled           = var.quantidade_nos > 1

  subnet_group_name  = aws_elasticache_subnet_group.principal.name
  security_group_ids = [aws_security_group.cache.id]

  at_rest_encryption_enabled = true
  kms_key_id                 = var.chave_kms_arn
  transit_encryption_enabled = true
  transit_encryption_mode    = "required"

  snapshot_retention_limit = var.retencao_snapshot_dias
  snapshot_window          = "03:00-04:00"
  maintenance_window       = "sun:06:30-sun:07:30"
  apply_immediately        = false
}
