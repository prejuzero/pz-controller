# Rede do PrejuZero: VPC com sub-redes públicas (balanceador e NAT) e privadas (apps, banco e cache).
data "aws_availability_zones" "disponiveis" {
  state = "available"
}

locals {
  zonas = slice(data.aws_availability_zones.disponiveis.names, 0, var.quantidade_zonas)
}

resource "aws_vpc" "principal" {
  cidr_block           = var.cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${var.nome}-vpc" }
}

resource "aws_subnet" "publica" {
  count                   = var.quantidade_zonas
  vpc_id                  = aws_vpc.principal.id
  cidr_block              = cidrsubnet(var.cidr, 4, count.index)
  availability_zone       = local.zonas[count.index]
  map_public_ip_on_launch = false
  tags                    = { Name = "${var.nome}-publica-${local.zonas[count.index]}" }
}

resource "aws_subnet" "privada" {
  count             = var.quantidade_zonas
  vpc_id            = aws_vpc.principal.id
  cidr_block        = cidrsubnet(var.cidr, 4, count.index + 8)
  availability_zone = local.zonas[count.index]
  tags              = { Name = "${var.nome}-privada-${local.zonas[count.index]}" }
}

resource "aws_internet_gateway" "principal" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = "${var.nome}-igw" }
}

resource "aws_eip" "nat" {
  count  = var.nat_por_zona ? var.quantidade_zonas : 1
  domain = "vpc"
  tags   = { Name = "${var.nome}-nat-${count.index}" }
}

resource "aws_nat_gateway" "principal" {
  count         = var.nat_por_zona ? var.quantidade_zonas : 1
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.publica[count.index].id
  tags          = { Name = "${var.nome}-nat-${count.index}" }
  depends_on    = [aws_internet_gateway.principal]
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.principal.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.principal.id
  }
  tags = { Name = "${var.nome}-rotas-publicas" }
}

resource "aws_route_table_association" "publica" {
  count          = var.quantidade_zonas
  subnet_id      = aws_subnet.publica[count.index].id
  route_table_id = aws_route_table.publica.id
}

resource "aws_route_table" "privada" {
  count  = var.quantidade_zonas
  vpc_id = aws_vpc.principal.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.principal[var.nat_por_zona ? count.index : 0].id
  }
  tags = { Name = "${var.nome}-rotas-privadas-${count.index}" }
}

resource "aws_route_table_association" "privada" {
  count          = var.quantidade_zonas
  subnet_id      = aws_subnet.privada[count.index].id
  route_table_id = aws_route_table.privada[count.index].id
}

# Registro do tráfego da VPC (investigação de incidentes, RNF25).
resource "aws_cloudwatch_log_group" "fluxo" {
  name              = "/prejuzero/${var.nome}/vpc-flow-logs"
  retention_in_days = var.retencao_logs_dias
  kms_key_id        = var.chave_kms_arn
}

data "aws_iam_policy_document" "fluxo_assumir" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "fluxo" {
  name               = "${var.nome}-vpc-flow-logs"
  assume_role_policy = data.aws_iam_policy_document.fluxo_assumir.json
}

data "aws_iam_policy_document" "fluxo_escrever" {
  statement {
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = ["${aws_cloudwatch_log_group.fluxo.arn}:*"]
  }
}

resource "aws_iam_role_policy" "fluxo" {
  name   = "escrever-flow-logs"
  role   = aws_iam_role.fluxo.id
  policy = data.aws_iam_policy_document.fluxo_escrever.json
}

resource "aws_flow_log" "principal" {
  vpc_id          = aws_vpc.principal.id
  traffic_type    = "ALL"
  log_destination = aws_cloudwatch_log_group.fluxo.arn
  iam_role_arn    = aws_iam_role.fluxo.arn
}
