variable "nome" {
  description = "Prefixo dos recursos (ex.: pz-staging)."
  type        = string
}

variable "cidr" {
  description = "Bloco CIDR da VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "quantidade_zonas" {
  description = "Zonas de disponibilidade usadas (mínimo 2 para banco e balanceador)."
  type        = number
  default     = 2
  validation {
    condition     = var.quantidade_zonas >= 2 && var.quantidade_zonas <= 3
    error_message = "Use 2 ou 3 zonas."
  }
}

variable "nat_por_zona" {
  description = "Um NAT por zona (produção) ou um único NAT (staging, mais barato)."
  type        = bool
  default     = false
}

variable "chave_kms_arn" {
  description = "Chave KMS para criptografar os logs."
  type        = string
}

variable "retencao_logs_dias" {
  description = "Retenção dos flow logs."
  type        = number
  default     = 90
}
