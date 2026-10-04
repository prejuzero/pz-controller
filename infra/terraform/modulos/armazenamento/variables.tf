variable "nome" {
  description = "Prefixo dos buckets (ex.: pz-staging)."
  type        = string
}

variable "sufixo_unico" {
  description = "Sufixo para tornar os nomes globalmente únicos (ex.: ID da conta)."
  type        = string
}

variable "chave_kms_arn" {
  description = "Chave KMS para criptografia dos objetos."
  type        = string
}

variable "bucket_logs_acesso" {
  description = "Bucket que recebe os logs de acesso do S3."
  type        = string
}

variable "retencao_auditoria_dias" {
  description = "Retenção WORM da cópia da auditoria (definir com o jurídico, RNF17)."
  type        = number
  default     = 1825
}

variable "retencao_relatorios_dias" {
  description = "Dias até apagar relatórios gerados."
  type        = number
  default     = 30
}
