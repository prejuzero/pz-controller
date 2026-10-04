variable "nome" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "subredes_publicas" {
  type = list(string)
}

variable "subredes_privadas" {
  type = list(string)
}

variable "chave_kms_arn" {
  type = string
}

variable "certificado_arn" {
  description = "Certificado ACM do domínio do ambiente."
  type        = string
}

variable "segredos_arn" {
  description = "Segredos que as tarefas podem ler na inicialização (o primeiro é a configuração das apps)."
  type        = list(string)
}

variable "buckets_arn" {
  type = list(string)
}

variable "repositorios" {
  description = "Repositórios de imagem a criar no ECR."
  type        = list(string)
  default     = ["api", "worker", "web"]
}

variable "versao_imagem" {
  description = "Tag da imagem a implantar (o SHA do commit, gerado pelo pipeline de deploy)."
  type        = string
  default     = "inicial"
}

variable "variaveis_ambiente" {
  description = "Variáveis não sensíveis comuns a todos os serviços."
  type        = map(string)
  default     = {}
}

variable "servicos" {
  description = "Serviços ECS. Vazio até as apps existirem (HU04 e HU23)."
  type = map(object({
    repositorio = string
    porta       = number
    cpu         = number
    memoria     = number
    quantidade  = number
    publico     = bool
    caminhos    = optional(list(string), [])
    prioridade  = optional(number, 100)
    comando     = optional(list(string))
    variaveis   = optional(map(string), {})
  }))
  default = {}
}

variable "retencao_logs_dias" {
  type    = number
  default = 90
}

variable "protecao_exclusao" {
  type    = bool
  default = true
}

variable "bucket_logs_acesso" {
  description = "Bucket que recebe os logs de acesso do balanceador."
  type        = string
}
