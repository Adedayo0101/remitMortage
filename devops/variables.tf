variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_username" {
  description = "Username for the PostgreSQL database"
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "Password for the PostgreSQL database"
  type        = string
  sensitive   = true
}

variable "app_image" {
  description = "ECR Image URI for the App Runner service"
  type        = string
  default     = "public.ecr.aws/nginx/nginx:latest" # Placeholder
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}
