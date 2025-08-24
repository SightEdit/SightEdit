# SightEdit Infrastructure as Code - Main Configuration
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.20"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.10"
    }
  }

  backend "s3" {
    # Configure in terraform.tfvars or via environment variables
    # bucket = "sightedit-terraform-state"
    # key    = "infrastructure/terraform.tfstate"
    # region = "us-west-2"
    # encrypt = true
    # dynamodb_table = "sightedit-terraform-locks"
  }
}

# Configure AWS Provider
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "SightEdit"
      Terraform   = "true"
      Owner       = var.owner
    }
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

# Local values
locals {
  name_prefix = "${var.project_name}-${var.environment}"
  
  common_tags = {
    Environment = var.environment
    Project     = var.project_name
    Terraform   = "true"
    Owner       = var.owner
  }

  # Network configuration
  vpc_cidr = var.vpc_cidr
  azs      = slice(data.aws_availability_zones.available.names, 0, var.availability_zone_count)
  
  # Calculate subnet CIDRs
  public_subnet_cidrs  = [for i, az in local.azs : cidrsubnet(local.vpc_cidr, 4, i)]
  private_subnet_cidrs = [for i, az in local.azs : cidrsubnet(local.vpc_cidr, 4, i + length(local.azs))]
  db_subnet_cidrs      = [for i, az in local.azs : cidrsubnet(local.vpc_cidr, 4, i + (2 * length(local.azs)))]
}

# VPC and Networking
module "vpc" {
  source = "./modules/vpc"
  
  name_prefix = local.name_prefix
  vpc_cidr    = local.vpc_cidr
  azs         = local.azs
  
  public_subnet_cidrs  = local.public_subnet_cidrs
  private_subnet_cidrs = local.private_subnet_cidrs
  db_subnet_cidrs      = local.db_subnet_cidrs
  
  enable_nat_gateway     = var.enable_nat_gateway
  single_nat_gateway     = var.single_nat_gateway
  enable_vpn_gateway     = var.enable_vpn_gateway
  enable_dns_hostnames   = true
  enable_dns_support     = true
  
  tags = local.common_tags
}

# Security Groups
module "security_groups" {
  source = "./modules/security"
  
  name_prefix = local.name_prefix
  vpc_id      = module.vpc.vpc_id
  
  tags = local.common_tags
}

# Application Load Balancer
module "alb" {
  source = "./modules/alb"
  
  name_prefix = local.name_prefix
  vpc_id      = module.vpc.vpc_id
  subnet_ids  = module.vpc.public_subnet_ids
  
  security_group_id = module.security_groups.alb_security_group_id
  certificate_arn   = var.acm_certificate_arn
  
  tags = local.common_tags
}

# EKS Cluster
module "eks" {
  source = "./modules/eks"
  
  name_prefix = local.name_prefix
  
  vpc_id                    = module.vpc.vpc_id
  subnet_ids                = module.vpc.private_subnet_ids
  control_plane_subnet_ids  = module.vpc.private_subnet_ids
  
  cluster_version = var.eks_cluster_version
  
  node_groups = var.eks_node_groups
  
  # Security
  cluster_endpoint_private_access = var.eks_cluster_endpoint_private_access
  cluster_endpoint_public_access  = var.eks_cluster_endpoint_public_access
  cluster_endpoint_public_access_cidrs = var.eks_cluster_endpoint_public_access_cidrs
  
  tags = local.common_tags
}

# RDS Database
module "rds" {
  source = "./modules/rds"
  count  = var.enable_rds ? 1 : 0
  
  name_prefix = local.name_prefix
  
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.db_subnet_ids
  
  security_group_id = module.security_groups.rds_security_group_id
  
  instance_class    = var.rds_instance_class
  engine_version    = var.rds_engine_version
  allocated_storage = var.rds_allocated_storage
  
  database_name = var.database_name
  username      = var.database_username
  
  backup_retention_period = var.rds_backup_retention_period
  backup_window          = var.rds_backup_window
  maintenance_window     = var.rds_maintenance_window
  
  multi_az               = var.rds_multi_az
  storage_encrypted      = var.rds_storage_encrypted
  deletion_protection    = var.rds_deletion_protection
  
  tags = local.common_tags
}

# ElastiCache Redis
module "redis" {
  source = "./modules/redis"
  count  = var.enable_redis ? 1 : 0
  
  name_prefix = local.name_prefix
  
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
  
  security_group_id = module.security_groups.redis_security_group_id
  
  node_type               = var.redis_node_type
  engine_version         = var.redis_engine_version
  parameter_group_name   = var.redis_parameter_group_name
  num_cache_clusters     = var.redis_num_cache_clusters
  
  at_rest_encryption_enabled = var.redis_at_rest_encryption_enabled
  transit_encryption_enabled = var.redis_transit_encryption_enabled
  
  tags = local.common_tags
}

# S3 Bucket for static assets
module "s3" {
  source = "./modules/s3"
  
  name_prefix = local.name_prefix
  
  # CDN bucket for static assets
  create_cdn_bucket = var.create_cdn_bucket
  cdn_bucket_name   = var.cdn_bucket_name
  
  # Backup bucket
  create_backup_bucket = var.create_backup_bucket
  backup_bucket_name   = var.backup_bucket_name
  
  tags = local.common_tags
}

# CloudFront CDN
module "cloudfront" {
  source = "./modules/cloudfront"
  count  = var.enable_cloudfront ? 1 : 0
  
  name_prefix = local.name_prefix
  
  s3_bucket_domain_name = module.s3.cdn_bucket_domain_name
  s3_bucket_id         = module.s3.cdn_bucket_id
  
  alb_domain_name = module.alb.dns_name
  
  certificate_arn = var.acm_certificate_arn
  domain_name     = var.domain_name
  
  price_class = var.cloudfront_price_class
  
  tags = local.common_tags
}

# Route53 DNS
module "route53" {
  source = "./modules/route53"
  count  = var.enable_route53 ? 1 : 0
  
  domain_name = var.domain_name
  zone_id     = var.route53_zone_id
  
  # ALB record
  alb_dns_name    = module.alb.dns_name
  alb_zone_id     = module.alb.zone_id
  
  # CloudFront record (if enabled)
  cloudfront_dns_name = var.enable_cloudfront ? module.cloudfront[0].domain_name : null
  cloudfront_zone_id  = var.enable_cloudfront ? module.cloudfront[0].hosted_zone_id : null
  
  tags = local.common_tags
}

# Monitoring and Logging
module "monitoring" {
  source = "./modules/monitoring"
  
  name_prefix = local.name_prefix
  
  # EKS cluster for monitoring
  cluster_name = module.eks.cluster_name
  
  # Enable various monitoring components
  enable_prometheus     = var.enable_prometheus
  enable_grafana       = var.enable_grafana
  enable_alertmanager  = var.enable_alertmanager
  enable_jaeger        = var.enable_jaeger
  
  # CloudWatch
  enable_cloudwatch_insights = var.enable_cloudwatch_insights
  log_retention_days         = var.cloudwatch_log_retention_days
  
  tags = local.common_tags
}