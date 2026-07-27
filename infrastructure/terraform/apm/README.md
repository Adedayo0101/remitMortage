# APM / Distributed Tracing Terraform Configuration

Provisions a centralized trace collector so requests can be followed across
the Express backend, the database, and downstream Soroban RPC calls. Traces
are exported from the backend using [OpenTelemetry](https://opentelemetry.io/)
over OTLP and land in a [Jaeger](https://www.jaegertracing.io/) all-in-one
deployment, which doubles as the collector, storage, query API, and UI.

Jaeger has accepted OTLP natively since 1.35, so this deployment doesn't run
a separate OpenTelemetry Collector process — one Fargate service is enough
at this project's traffic volume. Swap in a standalone OTel Collector (or a
managed APM backend such as Elastic APM Server / Grafana Tempo) later by
pointing `OTEL_EXPORTER_OTLP_ENDPOINT` elsewhere; the backend-side
instrumentation (`backend/src/tracing.ts`) doesn't need to change.

## Architecture

- **VPC**: A standalone network for the collector, independent of
  `devops/main.tf` and `infrastructure/terraform/elk` — each of these
  Terraform roots is deployed and managed separately.
- **ECS Fargate**: Runs the `jaegertracing/all-in-one` container with
  `COLLECTOR_OTLP_ENABLED=true`, exposing OTLP/gRPC (4317), OTLP/HTTP (4318),
  and the query UI (16686).
- **Network Load Balancer**: Fronts the OTLP ports with a stable DNS name —
  used as the backend's `OTEL_EXPORTER_OTLP_ENDPOINT`. NLBs pass TCP through
  without terminating it, so both gRPC and HTTP OTLP exporters work.
- **Application Load Balancer**: Fronts the Jaeger query UI on port 80,
  restricted to `var.allowed_ui_cidrs`.
- **Security groups**: The collector only accepts OTLP traffic from
  `var.app_source_cidrs` (the backend's network) and UI traffic from the ALB.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads) (>= 1.5.0)
- AWS CLI configured with credentials that can create VPC, ECS, ELBv2, IAM,
  and CloudWatch Logs resources

## Deployment

```bash
cd infrastructure/terraform/apm
terraform init
terraform plan -var='app_source_cidrs=["10.0.0.0/16"]'
terraform apply -var='app_source_cidrs=["10.0.0.0/16"]'
```

`app_source_cidrs` should cover wherever the backend actually runs from —
e.g. the VPC connector subnets from `devops/main.tf`
(`aws_apprunner_vpc_connector.main`) or that stack's `vpc_cidr` output.
Restrict `allowed_ui_cidrs` similarly in production; it defaults wide open
for local evaluation only.

After apply, wire the outputs into the backend's environment:

```bash
terraform output otlp_http_endpoint
# -> http://<nlb-dns-name>:4318
```

```bash
# backend/.env
OTEL_EXPORTER_OTLP_ENDPOINT=http://<nlb-dns-name>:4318
OTEL_SERVICE_NAME=remitmortgage-backend
OTEL_TRACES_SAMPLER_RATIO=1.0
```

Tracing is fully disabled — zero overhead, no exporter created — whenever
`OTEL_EXPORTER_OTLP_ENDPOINT` is unset, so it's safe to leave unconfigured in
local development.

View traces at `terraform output jaeger_ui_url`.

## Variables

| Variable                | Description                                                     | Default                              |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------- |
| `aws_region`             | AWS region for the APM infrastructure                             | `us-east-1`                           |
| `project_name`           | Project name for resource naming                                  | `remitmortgage`                       |
| `environment`            | Deployment environment                                             | `production`                          |
| `vpc_cidr`               | CIDR block for the APM VPC                                         | `10.200.0.0/16`                       |
| `availability_zones`     | AZs to spread the collector across                                 | `["us-east-1a", "us-east-1b"]`        |
| `jaeger_image`           | Jaeger all-in-one container image                                  | `jaegertracing/all-in-one:1.60`       |
| `jaeger_cpu` / `jaeger_memory` | Fargate task sizing                                          | `512` / `1024`                        |
| `otlp_grpc_port` / `otlp_http_port` | OTLP ingestion ports                                    | `4317` / `4318`                       |
| `ui_port`                | Jaeger query UI port                                                | `16686`                               |
| `allowed_ui_cidrs`       | CIDRs allowed to reach the UI via the ALB                          | `["0.0.0.0/0"]` (restrict in prod)    |
| `app_source_cidrs`       | CIDRs allowed to send OTLP traces (**required**, no default)      | —                                      |
| `log_retention_days`     | CloudWatch log retention                                           | `30`                                   |
| `trace_retention_hours`  | Documents the in-memory span storage window (informational)       | `48`                                   |

## Scaling and durability

`SPAN_STORAGE_TYPE=memory` keeps recent traces in the Jaeger process's
memory, bounded by `MEMORY_MAX_TRACES` — sufficient for debugging and
short-term analysis at this project's scale, but traces don't survive a task
restart and aren't queryable beyond that window. For durable, longer-lived
trace storage, point Jaeger at Elasticsearch or Cassandra instead
(`SPAN_STORAGE_TYPE=elasticsearch`, wiring `ES_SERVER_URLS` at the
`infrastructure/terraform/elk` endpoint) and increase `jaeger_cpu`/
`jaeger_memory` accordingly.

## Destroy

```bash
terraform destroy -var='app_source_cidrs=["10.0.0.0/16"]'
```
