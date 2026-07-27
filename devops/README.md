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

## Backup Verification

A backup nobody has restored is an assumption, not a recovery plan. The
`Backup Verification` workflow (`.github/workflows/backup-verification.yml`)
runs a full drill on the 1st of every month, and on demand via
`workflow_dispatch`:

1. Stands up a disposable Postgres 16 and applies the live Prisma schema to a
   mock source database.
2. Dumps it with `pg_dump -F c` — the same format
   `backend/src/services/databaseBackup.ts` writes.
3. Restores the dump into a separate sandbox database with `pg_restore`.
4. Compares table names, index names and exact row counts between source and
   restored, failing on any drift.

The drill logic lives in `scripts/verify-backup-restore.sh` and can be pointed
at any pair of databases locally:

```bash
SOURCE_DATABASE_URL=postgres://... \
SANDBOX_DATABASE_URL=postgres://... \
  ./scripts/verify-backup-restore.sh
```

> The sandbox database's `public` schema is dropped and recreated. Never point
> `SANDBOX_DATABASE_URL` at anything you care about.

Every run uploads a `backup-verification-report` artifact (90-day retention)
recording archive size, object counts and the pass/fail verdict — that artifact
is the audit record that recovery was verified for the month.

### Alerting Secrets

Failed scheduled runs email the on-call address. Configure these repository
secrets, or the alert step is skipped:

| Secret | Description |
| ------ | ----------- |
| `ALERT_SMTP_SERVER` | SMTP host used to send failure alerts |
| `ALERT_SMTP_PORT` | SMTP port (e.g. `465` for SMTPS) |
| `ALERT_SMTP_USERNAME` | SMTP account username |
| `ALERT_SMTP_PASSWORD` | SMTP account password or app token |
| `ALERT_EMAIL_TO` | Comma-separated recipients for recovery failures |
