# Execução das apps em containers (ADR-010): ECR, ECS Fargate e balanceador HTTPS.
# Os serviços só são criados quando informados em `servicos` (as apps nascem na HU04 e na HU23).
data "aws_region" "atual" {}

locals {
  servicos_publicos = { for nome, s in var.servicos : nome => s if s.publico }
}

# ---------- Imagens ----------
resource "aws_ecr_repository" "app" {
  for_each             = toset(var.repositorios)
  name                 = "${var.nome}/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = var.chave_kms_arn
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Manter as 30 imagens mais recentes"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
      action       = { type = "expire" }
    }]
  })
}

# ---------- Cluster e logs ----------
resource "aws_ecs_cluster" "principal" {
  name = var.nome
  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
}

resource "aws_cloudwatch_log_group" "apps" {
  name              = "/prejuzero/${var.nome}/apps"
  retention_in_days = var.retencao_logs_dias
  kms_key_id        = var.chave_kms_arn
}

# ---------- Rede das apps ----------
resource "aws_security_group" "apps" {
  name        = "${var.nome}-apps"
  description = "Tarefas ECS das apps"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "apps_do_balanceador" {
  security_group_id            = aws_security_group.apps.id
  description                  = "Trafego vindo do balanceador"
  referenced_security_group_id = aws_security_group.balanceador.id
  ip_protocol                  = "tcp"
  from_port                    = 1024
  to_port                      = 65535
}

# As apps chamam APIs externas (DJEN, e-mail, IA) pela internet, via NAT, em HTTPS.
# trivy:ignore:AVD-AWS-0104
resource "aws_vpc_security_group_egress_rule" "apps_https" {
  security_group_id = aws_security_group.apps.id
  description       = "HTTPS para servicos externos via NAT"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "apps_vpc" {
  security_group_id = aws_security_group.apps.id
  description       = "Banco e cache dentro da VPC"
  cidr_ipv4         = var.vpc_cidr
  ip_protocol       = "tcp"
  from_port         = 0
  to_port           = 65535
}

resource "aws_security_group" "balanceador" {
  name        = "${var.nome}-balanceador"
  description = "Balanceador publico (HTTPS)"
  vpc_id      = var.vpc_id
}

# Portal e API são públicos por natureza: o balanceador recebe HTTPS da internet.
# trivy:ignore:AVD-AWS-0107
resource "aws_vpc_security_group_ingress_rule" "balanceador_https" {
  security_group_id = aws_security_group.balanceador.id
  description       = "HTTPS publico"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

# trivy:ignore:AVD-AWS-0107
resource "aws_vpc_security_group_ingress_rule" "balanceador_http" {
  security_group_id = aws_security_group.balanceador.id
  description       = "HTTP publico apenas para redirecionar a HTTPS"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "balanceador_apps" {
  security_group_id            = aws_security_group.balanceador.id
  description                  = "Encaminha para as apps"
  referenced_security_group_id = aws_security_group.apps.id
  ip_protocol                  = "tcp"
  from_port                    = 1024
  to_port                      = 65535
}

# ---------- Balanceador ----------
# trivy:ignore:AVD-AWS-0053
resource "aws_lb" "principal" {
  name                       = "${var.nome}-alb"
  load_balancer_type         = "application"
  internal                   = false
  subnets                    = var.subredes_publicas
  security_groups            = [aws_security_group.balanceador.id]
  drop_invalid_header_fields = true
  enable_deletion_protection = var.protecao_exclusao

  # Logs de acesso do balanceador para investigação de incidentes (RNF25).
  access_logs {
    bucket  = var.bucket_logs_acesso
    prefix  = "alb"
    enabled = true
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.principal.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.principal.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-Res-2021-06"
  certificate_arn   = var.certificado_arn
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Nao encontrado"
      status_code  = "404"
    }
  }
}

resource "aws_lb_target_group" "servico" {
  for_each    = local.servicos_publicos
  name        = substr("${var.nome}-${each.key}", 0, 32)
  port        = each.value.porta
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id
  health_check {
    path                = "/health/ready"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  deregistration_delay = 30
}

resource "aws_lb_listener_rule" "servico" {
  for_each     = local.servicos_publicos
  listener_arn = aws_lb_listener.https.arn
  priority     = each.value.prioridade
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.servico[each.key].arn
  }
  condition {
    path_pattern {
      values = each.value.caminhos
    }
  }
}

# ---------- Papéis IAM ----------
data "aws_iam_policy_document" "tarefa_assumir" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Papel de execução: baixar imagem, escrever logs e ler segredos na inicialização.
resource "aws_iam_role" "execucao" {
  name               = "${var.nome}-ecs-execucao"
  assume_role_policy = data.aws_iam_policy_document.tarefa_assumir.json
}

resource "aws_iam_role_policy_attachment" "execucao_padrao" {
  role       = aws_iam_role.execucao.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execucao_segredos" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.segredos_arn
  }
  statement {
    actions   = ["kms:Decrypt"]
    resources = [var.chave_kms_arn]
  }
}

resource "aws_iam_role_policy" "execucao_segredos" {
  name   = "ler-segredos"
  role   = aws_iam_role.execucao.id
  policy = data.aws_iam_policy_document.execucao_segredos.json
}

# Papel da aplicação: só os buckets do ambiente. Permissões de SES e outras entram nas histórias delas.
resource "aws_iam_role" "app" {
  name               = "${var.nome}-ecs-app"
  assume_role_policy = data.aws_iam_policy_document.tarefa_assumir.json
}

data "aws_iam_policy_document" "app_buckets" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
    resources = concat(var.buckets_arn, [for arn in var.buckets_arn : "${arn}/*"])
  }
  statement {
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [var.chave_kms_arn]
  }
}

resource "aws_iam_role_policy" "app_buckets" {
  name   = "acessar-buckets"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.app_buckets.json
}

# ---------- Serviços ----------
resource "aws_ecs_task_definition" "servico" {
  for_each                 = var.servicos
  family                   = "${var.nome}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memoria
  execution_role_arn       = aws_iam_role.execucao.arn
  task_role_arn            = aws_iam_role.app.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  container_definitions = jsonencode([{
    name                   = each.key
    image                  = "${aws_ecr_repository.app[each.value.repositorio].repository_url}:${var.versao_imagem}"
    essential              = true
    readonlyRootFilesystem = true
    command                = each.value.comando
    portMappings           = [{ containerPort = each.value.porta, protocol = "tcp" }]
    environment = [for chave, valor in merge(var.variaveis_ambiente, each.value.variaveis) :
    { name = chave, value = valor }]
    secrets = [{ name = "CONFIGURACAO_SEGREDOS", valueFrom = var.segredos_arn[0] }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.apps.name
        awslogs-region        = data.aws_region.atual.region
        awslogs-stream-prefix = each.key
      }
    }
  }])
}

resource "aws_ecs_service" "servico" {
  for_each        = var.servicos
  name            = each.key
  cluster         = aws_ecs_cluster.principal.id
  task_definition = aws_ecs_task_definition.servico[each.key].arn
  desired_count   = each.value.quantidade
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subredes_privadas
    security_groups  = [aws_security_group.apps.id]
    assign_public_ip = false
  }

  # Deploy rolling com rollback automático se as novas tarefas não ficarem saudáveis.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  dynamic "load_balancer" {
    for_each = each.value.publico ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.servico[each.key].arn
      container_name   = each.key
      container_port   = each.value.porta
    }
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}
