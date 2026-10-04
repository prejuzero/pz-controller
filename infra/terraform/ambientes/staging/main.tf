# Staging: dados sintéticos, tamanhos mínimos e um único NAT para reduzir custo.
provider "aws" {
  region = "sa-east-1"
  default_tags {
    tags = {
      projeto    = "prejuzero"
      ambiente   = "staging"
      gerenciado = "terraform"
    }
  }
}

module "plataforma" {
  source = "../../modulos/plataforma"

  nome            = "pz-staging"
  cidr            = "10.20.0.0/16"
  nat_por_zona    = false
  certificado_arn = var.certificado_arn
  versao_imagem   = var.versao_imagem
  servicos        = var.servicos

  banco_classe               = "db.t4g.medium"
  banco_multi_az             = false
  banco_retencao_backup_dias = 7
  cache_tipo_no              = "cache.t4g.small"
  cache_quantidade_nos       = 1
  retencao_logs_dias         = 30
  retencao_auditoria_dias    = 30
}
