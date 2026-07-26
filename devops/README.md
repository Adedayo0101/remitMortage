# DevOps Infrastructure

This directory contains the Terraform configuration for deploying the RemitMortgage backend infrastructure.

## Architecture

The infrastructure consists of:
- **VPC**: An isolated virtual private cloud with public and private subnets.
- **RDS PostgreSQL**: A managed relational database instance deployed in the private subnets.
- **ElastiCache Redis**: A managed in-memory cache deployed in the private subnets.
- **App Runner**: A fully managed container application service that runs the backend API, configured with a VPC Connector to access the database and cache securely.
- **Security Groups**: Granular network access controls ensuring the database and cache are only accessible from the App Runner service.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads) (>= 1.5.0)
- [AWS CLI](https://aws.amazon.com/cli/) installed and configured with appropriate credentials
- Docker image pushed to ECR Public (for App Runner)

## Deployment Sequences

### 1. Initialize Terraform

Initialize the working directory containing Terraform configuration files. This is the first command that should be run after writing a new Terraform configuration or cloning an existing one.

```bash
terraform init
```

### 2. Validate Configuration

Validate the configuration files in a directory, referring only to the configuration and not accessing any remote services such as remote state, provider APIs, etc.

```bash
terraform validate
```

### 3. Plan Infrastructure

Create an execution plan, which lets you preview the changes that Terraform plans to make to your infrastructure.

```bash
terraform plan -var="db_password=YOUR_SECURE_PASSWORD"
```

### 4. Apply Infrastructure

Execute the actions proposed in a Terraform plan.

```bash
terraform apply -var="db_password=YOUR_SECURE_PASSWORD"
```

### 5. Destroy Infrastructure

Destroy all remote objects managed by a particular Terraform configuration.

```bash
terraform destroy -var="db_password=YOUR_SECURE_PASSWORD"
```

## Variables

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `aws_region` | AWS region for deployment | `us-east-1` |
| `vpc_cidr` | CIDR block for the VPC | `10.0.0.0/16` |
| `db_username` | Username for the PostgreSQL database | `postgres` |
| `db_password` | Password for the PostgreSQL database | (Required) |
| `app_image` | ECR Image URI for the App Runner service | `public.ecr.aws/nginx/nginx:latest` |
| `environment` | Deployment environment | `dev` |
