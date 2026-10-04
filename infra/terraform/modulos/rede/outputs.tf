output "vpc_id" {
  value = aws_vpc.principal.id
}

output "vpc_cidr" {
  value = aws_vpc.principal.cidr_block
}

output "subredes_publicas" {
  value = aws_subnet.publica[*].id
}

output "subredes_privadas" {
  value = aws_subnet.privada[*].id
}
