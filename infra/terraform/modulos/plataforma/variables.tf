variable "nome" {
  description = "Prefixo do ambiente (ex.: pz-staging)."
  type        = string
}

variable "cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "quantidade_zonas" {
  type    = number
  default = 2
}

variable "nat_por_zona" {
  type    = bool
  default = false
}

variable "certificado_arn" {
  description = "Certificado ACM (na mesma região) do domínio do ambiente."
  type        = string
}

variable "versao_imagem" {
  type    = string
  default = "inicial"
}

variable "servicos" {
  description = "Serviços ECS das apps (vazio até HU04/HU23). Ver modulos/computacao."
  type        = any
  default     = {}
}

variable "variaveis_ambiente" {
  type    = map(string)
  default = {}
}

variable "retencao_logs_dias" {
  type    = number
  default = 90
}

variable "retencao_auditoria_dias" {
  type    = number
  default = 1825
}

variable "protecao_exclusao" {
  type    = bool
  default = true
}

variable "banco_classe" {
  type    = string
  default = "db.t4g.medium"
}

variable "banco_multi_az" {
  type    = bool
  default = false
}

variable "banco_retencao_backup_dias" {
  type    = number
  default = 7
}

variable "banco_armazenamento_gb" {
  type    = number
  default = 50
}

variable "banco_armazenamento_maximo_gb" {
  type    = number
  default = 500
}

variable "cache_tipo_no" {
  type    = string
  default = "cache.t4g.small"
}

variable "cache_quantidade_nos" {
  type    = number
  default = 1
}

variable "conta_elb_regiao" {
  description = "Conta do Elastic Load Balancing que entrega logs de acesso na região (sa-east-1: 507241528517)."
  type        = string
  default     = "507241528517"
}
