variable "certificado_arn" {
  description = "Certificado ACM do domínio do ambiente, em sa-east-1."
  type        = string
}

variable "versao_imagem" {
  description = "Tag das imagens a implantar (SHA do commit). Definida pelo pipeline de deploy."
  type        = string
  default     = "inicial"
}

variable "servicos" {
  description = "Serviços ECS das apps. Vazio até a HU04 (api, worker) e a HU23 (web)."
  type        = any
  default     = {}
}
