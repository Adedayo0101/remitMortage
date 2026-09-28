# Multi-Region Failover Testing Guide

## Overview

This guide provides instructions for testing the multi-region DNS failover routing configuration. The setup provides automatic failover when the primary indexing node becomes unavailable.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Route53 Hosted Zone                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────┐    ┌──────────────────────┐           │
│  │  Primary Region     │    │  Secondary Region    │           │
│  │  (us-east-1)        │    │  (eu-west-1)         │           │
│  │                     │    │                      │           │
│  │  ┌─────────────┐    │    │  ┌──────────────┐   │           │
│  │  │  Indexer    │————┼────┼─→│  Failover    │   │           │
│  │  │  (Primary)  │    │    │  │  Indexer(s)  │   │           │
│  │  └─────────────┘    │    │  └──────────────┘   │           │
│  │        ↑            │    │        ↑            │           │
│  │  Health Check ✓    │    │  Health Check ✓    │           │
│  │     (HEALTHY)       │    │     (STANDBY)       │           │
│  └─────────────────────┘    └──────────────────────┘           │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. AWS account credentials configured
2. Terraform >= 1.0
3. AWS CLI installed and configured
4. Domain name registered with Route53
5. Email address for failover notifications

## Deployment

### 1. Initialize Terraform

```bash
cd devops/terraform

terraform init
```

### 2. Create Terraform Variables

Create `terraform.tfvars`:

```hcl
primary_region        = "us-east-1"
secondary_region      = "eu-west-1"
domain_name           = "your-domain.com"
alert_email           = "ops@your-domain.com"
api_port              = 8080
health_check_interval = 30
failure_threshold     = 3
failover_ttl          = 60
```

### 3. Plan and Apply

```bash
# Review the changes
terraform plan -out=tfplan

# Apply the configuration
terraform apply tfplan
```

### 4. Verify Deployment

```bash
# Get the DNS endpoints
terraform output

# Test the primary DNS endpoint
nslookup indexer.your-domain.com

# Check health status (should show HEALTHY for primary)
aws route53 get-health-check-status \
  --health-check-id <health-check-id> \
  --region us-east-1
```

## Failover Testing Scenarios

### Scenario 1: Simulate Primary Node Failure

#### Expected Behavior
- Primary indexer becomes unhealthy
- Route53 failover triggers within 60 seconds (ttl + health check interval)
- DNS queries shift to secondary region
- CloudWatch alarm triggers and sends notification email

#### Test Steps

```bash
# 1. SSH into primary indexer instance
ssh -i your-key.pem ec2-user@<primary-public-ip>

# 2. Simulate service failure by stopping the API server
sudo systemctl stop indexer-api

# Or kill the process directly
pkill -f "indexer-api"

# 3. Monitor health check status
watch -n 5 'aws route53 get-health-check-status \
  --health-check-id <primary-health-check-id> \
  --region us-east-1'

# 4. Wait 90 seconds for:
#    - Health checks to mark as UNHEALTHY (3 failures × 30s interval)
#    - Route53 to failover traffic
#    - CloudWatch alarm to trigger

# 5. Verify DNS now points to secondary
nslookup indexer.your-domain.com
# Should return secondary region IP

# 6. Verify metrics refresh automatically
curl https://indexer.your-domain.com/health
# Should now return secondary indexer health status

# 7. Restore primary service
sudo systemctl start indexer-api

# 8. Verify failback
# Wait ~120 seconds for health check to mark HEALTHY again
nslookup indexer.your-domain.com
# Should return primary region IP again
```

### Scenario 2: Regional Outage Simulation

#### Expected Behavior
- Multiple nodes in primary region become unavailable
- Automatic failover to secondary region
- Weighted routing distributes load across secondary instances

#### Test Steps

```bash
# 1. Stop all indexer instances in primary region
aws ec2 stop-instances \
  --instance-ids <primary-instance-id> \
  --region us-east-1

# 2. Monitor failover (should complete within 90 seconds)
for i in {1..20}; do
  echo "Attempt $i:"
  nslookup indexer.your-domain.com
  sleep 5
done

# 3. Verify all traffic routes to secondary
# Check secondary region logs for incoming requests
aws logs tail /aws/indexer/secondary --follow

# 4. Restart primary instances
aws ec2 start-instances \
  --instance-ids <primary-instance-id> \
  --region us-east-1

# 5. Monitor automatic failback
# Should complete within 120 seconds
```

### Scenario 3: Gradual Network Degradation

#### Expected Behavior
- Health checks detect timeout/errors
- Weighted routing shifts percentage of traffic to secondary
- No hard cutover, smooth load shedding

#### Test Steps

```bash
# 1. Introduce network latency on primary
ssh -i your-key.pem ec2-user@<primary-public-ip>
sudo tc qdisc add dev eth0 root netem delay 5000ms

# 2. Monitor metrics degradation
curl https://indexer.your-domain.com/metrics/latency

# 3. Watch weighted routing adjust
# Primary requests should increase latency
# Secondary should handle more traffic

# 4. Remove latency simulation
sudo tc qdisc del dev eth0 root netem

# 5. Verify recovery
curl https://indexer.your-domain.com/health
```

## Monitoring and Alerts

### CloudWatch Metrics

Monitor these key metrics:

```bash
# Health check status
aws cloudwatch get-metric-statistics \
  --namespace AWS/Route53 \
  --metric-name HealthCheckStatus \
  --dimensions Name=HealthCheckId,Value=<health-check-id> \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T01:00:00Z \
  --period 60 \
  --statistics Average

# DNS query count
aws cloudwatch get-metric-statistics \
  --namespace AWS/Route53 \
  --metric-name DNSQueries \
  --dimensions Name=HostedZoneId,Value=<zone-id> \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T01:00:00Z \
  --period 300 \
  --statistics Sum
```

### Email Notifications

AWS SNS sends failover alerts to the configured email address:

1. Subscription confirmation email will arrive first
2. Click the confirmation link
3. Future failover events trigger notifications within seconds

### Dashboard Setup

Create a CloudWatch Dashboard:

```bash
aws cloudwatch put-dashboard \
  --dashboard-name "RemitMortgage-Failover" \
  --dashboard-body file://dashboard-config.json
```

## Performance Targets

| Metric | Target | Actual* |
|--------|--------|---------|
| Detection time | < 90 seconds | 60-90s |
| Failover completion | < 60 seconds | 30-60s |
| Total RTO | < 2 minutes | ~90s |
| Health check interval | 30 seconds | 30s |
| DNS TTL | 60 seconds | 60s |

*Actual times depend on cloud provider response times and network conditions

## Cleanup

To remove all resources:

```bash
terraform destroy

# Confirm by typing 'yes' when prompted
```

## Troubleshooting

### Failover not triggering

```bash
# Check health check status
aws route53 list-health-checks

# Get detailed status
aws route53 get-health-check-status --health-check-id <id>

# Enable debug logging
aws route53 list-resource-record-sets \
  --hosted-zone-id <zone-id> \
  --query 'ResourceRecordSets[?Name==`indexer.your-domain.com`]'
```

### DNS not updating

```bash
# Clear your local DNS cache
# Linux: sudo systemd-resolve --flush-caches
# macOS: sudo dscacheutil -flushcache
# Windows: ipconfig /flushdns

# Query authoritative nameserver
dig indexer.your-domain.com @<route53-nameserver>
```

### Alarms not sending emails

```bash
# Check SNS subscription
aws sns list-subscriptions-by-topic --topic-arn <topic-arn>

# Resend confirmation if needed
aws sns subscribe \
  --topic-arn <topic-arn> \
  --protocol email \
  --notification-endpoint your-email@domain.com
```

## References

- [AWS Route53 Failover Routing](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy.html#routing-policy-failover)
- [AWS Route53 Health Checks](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/health-checks-types.html)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
