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
  description = "Security group das apps autorizadas a acessar o banco."
  type        = string
}

variable "chave_kms_arn" {
  type = string
}

variable "classe_instancia" {
  type    = string
  default = "db.t4g.medium"
}

variable "armazenamento_gb" {
  type    = number
  default = 50
}

variable "armazenamento_maximo_gb" {
  type    = number
  default = 500
}

variable "multi_az" {
  description = "Réplica síncrona em outra zona (obrigatório em produção, RNF02)."
  type        = bool
  default     = false
}

variable "retencao_backup_dias" {
  description = "Janela de restauração point-in-time (RPO 15 min)."
  type        = number
  default     = 7
}

variable "protecao_exclusao" {
  type    = bool
  default = true
}
