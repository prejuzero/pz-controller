variable "nome" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subredes_privadas" {
  type = list(string)
}

variable "grupo_seguranca_apps" {
  type = string
}

variable "chave_kms_arn" {
  type = string
}

variable "tipo_no" {
  type    = string
  default = "cache.t4g.small"
}

variable "quantidade_nos" {
  description = "1 em staging; 2 ou mais em produção (failover automático)."
  type        = number
  default     = 1
}

variable "retencao_snapshot_dias" {
  type    = number
  default = 1
}
