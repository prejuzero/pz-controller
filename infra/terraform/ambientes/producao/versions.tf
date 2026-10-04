terraform {
  required_version = ">= 1.10.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.67"
    }
  }
  # Estado remoto no S3 com trava nativa (use_lockfile). Configurado por `-backend-config=backend.hcl`.
  backend "s3" {}
}
