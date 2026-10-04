output "buckets" {
  description = "Nomes dos buckets por finalidade."
  value       = { for chave, bucket in aws_s3_bucket.principal : chave => bucket.bucket }
}

output "buckets_arn" {
  value = [for bucket in aws_s3_bucket.principal : bucket.arn]
}
