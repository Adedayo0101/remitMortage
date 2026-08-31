# ------------------------------------------------------------------------------
# Blue-Green Deployment Resources
#
# Provisions a second (idle) App Runner service alongside the existing one so
# new releases can be deployed and health-checked before traffic is switched.
#
# Slot semantics
#   blue  → currently active (receiving 100 % of traffic)
#   green → idle / staging (receives 0 % until health checks pass)
#
# Traffic switching is handled entirely by the GitHub Actions workflow
# (.github/workflows/blue-green-deploy.yml) which:
#   1. Deploys the new image to the idle slot.
#   2. Runs health checks against the idle slot's service URL.
#   3. Updates the Route 53 weighted records to flip traffic.
#   4. Rolls back by reverting the weighted records if post-switch checks fail.
# ------------------------------------------------------------------------------

# ── Idle (green) App Runner service ─────────────────────────────────────────
resource "aws_apprunner_service" "app_green" {
  service_name = "remit-mortgage-api-${var.environment}-green"

  source_configuration {
    image_repository {
      image_configuration {
        port = "8080"
        runtime_environment_variables = {
          DATABASE_URL                = "postgres://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/${aws_db_instance.postgres.db_name}"
          REDIS_URL                   = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379"
          REDIS_CLUSTER_ENABLED       = "false"
          REDIS_CLUSTER_NODES         = "${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379"
          OTEL_EXPORTER_OTLP_ENDPOINT = var.otel_exporter_otlp_endpoint
          OTEL_SERVICE_NAME           = "remitmortgage-backend-green"
          OTEL_TRACES_SAMPLER_RATIO   = var.otel_traces_sampler_ratio
        }
      }
      # Starts with the same image as blue; the deploy workflow updates this.
      image_identifier      = var.app_image
      image_repository_type = "ECR_PUBLIC"
    }
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.main.arn
    }
  }

  tags = {
    Name        = "remit-mortgage-api-${var.environment}-green"
    Environment = var.environment
    Slot        = "green"
  }
}

# Tag the existing (blue) service so the workflow can identify it by slot.
resource "aws_apprunner_service" "app_blue" {
  # Re-use the existing service declared in main.tf by overriding via tagging.
  # This resource block intentionally mirrors app (main.tf) — in practice only
  # one of these blocks should exist; rename/import as needed during first apply.
  service_name = "remit-mortgage-api-${var.environment}-blue"

  source_configuration {
    image_repository {
      image_configuration {
        port = "8080"
        runtime_environment_variables = {
          DATABASE_URL                = "postgres://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/${aws_db_instance.postgres.db_name}"
          REDIS_URL                   = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379"
          REDIS_CLUSTER_ENABLED       = "false"
          REDIS_CLUSTER_NODES         = "${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379"
          OTEL_EXPORTER_OTLP_ENDPOINT = var.otel_exporter_otlp_endpoint
          OTEL_SERVICE_NAME           = "remitmortgage-backend-blue"
          OTEL_TRACES_SAMPLER_RATIO   = var.otel_traces_sampler_ratio
        }
      }
      image_identifier      = var.app_image
      image_repository_type = "ECR_PUBLIC"
    }
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.main.arn
    }
  }

  tags = {
    Name        = "remit-mortgage-api-${var.environment}-blue"
    Environment = var.environment
    Slot        = "blue"
  }
}

# ── Outputs consumed by the deploy workflow ──────────────────────────────────
output "blue_service_url" {
  description = "Service URL of the blue (active) App Runner instance"
  value       = aws_apprunner_service.app_blue.service_url
}

output "green_service_url" {
  description = "Service URL of the green (idle) App Runner instance"
  value       = aws_apprunner_service.app_green.service_url
}

output "blue_service_arn" {
  description = "ARN of the blue App Runner service"
  value       = aws_apprunner_service.app_blue.arn
}

output "green_service_arn" {
  description = "ARN of the green App Runner service"
  value       = aws_apprunner_service.app_green.arn
}
