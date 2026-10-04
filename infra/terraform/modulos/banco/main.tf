# PostgreSQL 16 gerenciado (ADR-003, ADR-010): privado, criptografado, com PITR e TLS obrigatório.
resource "aws_db_subnet_group" "principal" {
  name       = "${var.nome}-banco"
  subnet_ids = var.subredes_privadas
}

resource "aws_security_group" "banco" {
  name        = "${var.nome}-banco"
  description = "PostgreSQL acessivel apenas pelas apps"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "banco_apps" {
  security_group_id            = aws_security_group.banco.id
  description                  = "PostgreSQL a partir das apps"
  referenced_security_group_id = var.grupo_seguranca_apps
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_db_parameter_group" "principal" {
  name   = "${var.nome}-postgres16"
  family = "postgres16"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }
  parameter {
    name  = "timezone"
    value = "UTC"
  }
}

resource "aws_db_instance" "principal" {
  identifier     = "${var.nome}-postgres"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.classe_instancia

  allocated_storage     = var.armazenamento_gb
  max_allocated_storage = var.armazenamento_maximo_gb
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.chave_kms_arn

  db_name                             = "prejuzero"
  username                            = "pz_migrator"
  manage_master_user_password         = true
  master_user_secret_kms_key_id       = var.chave_kms_arn
  iam_database_authentication_enabled = true

  db_subnet_group_name   = aws_db_subnet_group.principal.name
  vpc_security_group_ids = [aws_security_group.banco.id]
  parameter_group_name   = aws_db_parameter_group.principal.name
  publicly_accessible    = false
  multi_az               = var.multi_az

  backup_retention_period   = var.retencao_backup_dias
  backup_window             = "04:00-05:00"
  maintenance_window        = "sun:05:30-sun:06:30"
  copy_tags_to_snapshot     = true
  deletion_protection       = var.protecao_exclusao
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.nome}-postgres-final"

  auto_minor_version_upgrade            = true
  performance_insights_enabled          = true
  performance_insights_kms_key_id       = var.chave_kms_arn
  performance_insights_retention_period = 7
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]
}
