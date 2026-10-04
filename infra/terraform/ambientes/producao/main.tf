# Produção: alta disponibilidade (RNF02), NAT por zona, banco Multi-AZ e cache com failover.
provider "aws" {
  region = "sa-east-1"
  default_tags {
    tags = {
      projeto    = "prejuzero"
      ambiente   = "producao"
      gerenciado = "terraform"
    }
  }
}

module "plataforma" {
  source = "../../modulos/plataforma"

  nome            = "pz-producao"
  cidr            = "10.30.0.0/16"
  nat_por_zona    = true
  certificado_arn = var.certificado_arn
  versao_imagem   = var.versao_imagem
  servicos        = var.servicos

  banco_classe               = "db.m7g.large"
  banco_multi_az             = true
  banco_retencao_backup_dias = 35
  cache_tipo_no              = "cache.m7g.large"
  cache_quantidade_nos       = 2
  retencao_logs_dias         = 365
  # Retenção WORM da auditoria: confirmar com o jurídico e o DPO (RNF17).
  retencao_auditoria_dias = 1825
}
