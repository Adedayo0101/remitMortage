# APM & Distributed Tracing Setup

This document serves as the guide for setting up and using the OpenTelemetry distributed tracing and logger trace correlation in RemitMortgage.

## Overview
We utilize **OpenTelemetry (OTEL)** for capturing distribute traces. Backend Express logs, HTTP requests, and ORM database operations (via Prisma) are auto-instrumented. The spans are exported to an OTLP-compatible collector (Jaeger or Elastic APM).

## Terraform Collector deployment
Traces are provisioned to land on an ECS Fargate instance running Jaeger all-in-one stack.
- Terraform setup resides in `infrastructure/terraform/apm`.
- Ingress tracer ports `4317` (gRPC) and `4318` (HTTP) are secured via security group rules, allowing only the application CIDR blocks (`var.app_source_cidrs`).

## Secure Endpoints & Headers
Traces can also be secured during export by setting custom headers:
```bash
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <token>,x-apm-token=<secret>"
```
This is caught by the OpenTelemetry bootstrap in `backend/src/tracing.ts` and set dynamically on the HTTP exporter.

## Log Correlation
Logs exported by Winston have OpenTelemetry trace context decoration. Every log line emits matching:
- `traceId`
- `spanId`

This links errors to the exact transaction pipelines in the Jaeger / Elastic APM dashboards.
