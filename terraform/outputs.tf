# SightEdit Terraform Outputs

# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = module.vpc.vpc_cidr_block
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = module.vpc.public_subnet_ids
}

# EKS Outputs
output "eks_cluster_name" {
  description = "Name of the EKS cluster"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_version" {
  description = "Version of the EKS cluster"
  value       = module.eks.cluster_version
}

output "eks_cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = module.eks.cluster_security_group_id
}

output "eks_node_groups" {
  description = "EKS node groups"
  value       = module.eks.node_groups
}

output "eks_oidc_issuer_url" {
  description = "The URL on the EKS cluster for the OpenID Connect identity provider"
  value       = module.eks.cluster_oidc_issuer_url
}

# ALB Outputs
output "alb_dns_name" {
  description = "DNS name of the load balancer"
  value       = module.alb.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the load balancer"
  value       = module.alb.zone_id
}

output "alb_arn" {
  description = "ARN of the load balancer"
  value       = module.alb.arn
}

# RDS Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = var.enable_rds ? module.rds[0].endpoint : null
  sensitive   = true
}

output "rds_port" {
  description = "RDS instance port"
  value       = var.enable_rds ? module.rds[0].port : null
}

output "database_name" {
  description = "Database name"
  value       = var.enable_rds ? module.rds[0].database_name : null
}

# Redis Outputs
output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = var.enable_redis ? module.redis[0].endpoint : null
  sensitive   = true
}

output "redis_port" {
  description = "Redis cluster port"
  value       = var.enable_redis ? module.redis[0].port : null
}

# S3 Outputs
output "cdn_bucket_name" {
  description = "Name of the CDN S3 bucket"
  value       = module.s3.cdn_bucket_name
}

output "cdn_bucket_domain_name" {
  description = "Domain name of the CDN S3 bucket"
  value       = module.s3.cdn_bucket_domain_name
}

output "backup_bucket_name" {
  description = "Name of the backup S3 bucket"
  value       = module.s3.backup_bucket_name
}

# CloudFront Outputs
output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = var.enable_cloudfront ? module.cloudfront[0].distribution_id : null
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = var.enable_cloudfront ? module.cloudfront[0].domain_name : null
}

# Route53 Outputs
output "route53_zone_id" {
  description = "Route53 hosted zone ID"
  value       = var.enable_route53 ? module.route53[0].zone_id : null
}

# Security Groups
output "alb_security_group_id" {
  description = "Security group ID for ALB"
  value       = module.security_groups.alb_security_group_id
}

output "eks_worker_security_group_id" {
  description = "Security group ID for EKS worker nodes"
  value       = module.security_groups.eks_worker_security_group_id
}

output "rds_security_group_id" {
  description = "Security group ID for RDS"
  value       = module.security_groups.rds_security_group_id
}

output "redis_security_group_id" {
  description = "Security group ID for Redis"
  value       = module.security_groups.redis_security_group_id
}

# Connection Information (for kubectl configuration)
output "kubectl_config_command" {
  description = "Command to configure kubectl"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

# Application URLs
output "application_urls" {
  description = "URLs to access the application"
  value = {
    alb_url        = "https://${module.alb.dns_name}"
    cloudfront_url = var.enable_cloudfront ? "https://${module.cloudfront[0].domain_name}" : null
    custom_domain  = var.enable_route53 && var.domain_name != "" ? "https://${var.domain_name}" : null
  }
}

# Monitoring URLs
output "monitoring_urls" {
  description = "URLs for monitoring services"
  value = {
    grafana_url    = var.enable_grafana ? "https://${module.alb.dns_name}/grafana" : null
    prometheus_url = var.enable_prometheus ? "https://${module.alb.dns_name}/prometheus" : null
    jaeger_url     = var.enable_jaeger ? "https://${module.alb.dns_name}/jaeger" : null
  }
}

# Database Connection String (for application configuration)
output "database_url" {
  description = "Database connection URL"
  value = var.enable_rds ? format(
    "postgresql://%s:PASSWORD@%s:%s/%s",
    var.database_username,
    module.rds[0].endpoint,
    module.rds[0].port,
    module.rds[0].database_name
  ) : null
  sensitive = true
}

# Redis Connection String
output "redis_url" {
  description = "Redis connection URL"
  value = var.enable_redis ? format(
    "redis://%s:%s",
    module.redis[0].endpoint,
    module.redis[0].port
  ) : null
  sensitive = true
}