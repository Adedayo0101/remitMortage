# ELK Stack Terraform Configuration

This Terraform configuration provisions a production-ready ELK (Elasticsearch, Logstash, Kibana) stack on AWS for centralized log analysis and monitoring.

## Architecture

- **VPC**: Isolated network with private subnets across multiple availability zones
- **Elasticsearch**: Managed AWS Elasticsearch Service with:
  - Multi-AZ deployment for high availability
  - Dedicated master nodes for cluster management
  - EBS volumes with gp3 storage
  - Encryption at rest and in transit
  - Automated snapshots
- **Security**: Network isolation with security groups restricting access
- **Networking**: NAT Gateway for outbound internet access

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Terraform >= 1.0 installed
3. AWS account with permissions to create:
   - VPC and networking resources
   - Elasticsearch domains
   - IAM roles
   - CloudWatch logs

## Quick Start

### 1. Initialize Terraform

```bash
cd infrastructure/terraform/elk
terraform init
```

### 2. Review Configuration

Edit `variables.tf` or create `terraform.tfvars`:

```hcl
aws_region                    = "us-east-1"
project_name                  = "remitmortgage"
environment                   = "production"
elasticsearch_instance_type   = "r5.large.elasticsearch"
elasticsearch_instance_count  = 3
elasticsearch_volume_size     = 200
allowed_kibana_cidr          = ["10.0.0.0/8", "203.0.113.0/24"]
```

### 3. Plan Deployment

```bash
terraform plan
```

### 4. Deploy Infrastructure

```bash
terraform apply
```

Review the plan and type `yes` to proceed.

### 5. Retrieve Endpoints

After deployment completes:

```bash
terraform output elasticsearch_endpoint
terraform output kibana_endpoint
```

## Configuration Options

### Instance Sizing

**Development:**
```hcl
elasticsearch_instance_type  = "t3.small.elasticsearch"
elasticsearch_instance_count = 1
enable_dedicated_master      = false
```

**Production:**
```hcl
elasticsearch_instance_type  = "r5.large.elasticsearch"
elasticsearch_instance_count = 3
enable_dedicated_master      = true
dedicated_master_type        = "t3.medium.elasticsearch"
dedicated_master_count       = 3
```

### Storage

Adjust volume size based on log retention needs:
- **30 days retention**: 100-200 GB
- **90 days retention**: 300-500 GB
- **1 year retention**: 1000+ GB

### Network Access

**Restrict Kibana access** (recommended):
```hcl
allowed_kibana_cidr = [
  "10.0.0.0/8",        # Internal VPN
  "203.0.113.0/24"     # Office IP range
]
```

## Logstash Configuration

Once Elasticsearch is deployed, configure Logstash to ship logs:

### Docker Compose Example

```yaml
services:
  logstash:
    image: docker.elastic.co/logstash/logstash:7.10.0
    environment:
      - ELASTICSEARCH_HOST=<elasticsearch_endpoint>
      - ELASTICSEARCH_PORT=443
      - ELASTICSEARCH_SCHEME=https
    volumes:
      - ./logstash/pipeline:/usr/share/logstash/pipeline
      - ./logstash/config:/usr/share/logstash/config
```

### Logstash Pipeline Config

Create `logstash/pipeline/remitmortgage.conf`:

```ruby
input {
  http {
    port => 8080
    codec => json
  }
  beats {
    port => 5044
  }
}

filter {
  if [service] == "backend" {
    json {
      source => "message"
    }
  }
  
  mutate {
    add_field => {
      "environment" => "production"
      "project" => "remitmortgage"
    }
  }
}

output {
  elasticsearch {
    hosts => ["${ELASTICSEARCH_HOST}:${ELASTICSEARCH_PORT}"]
    index => "remitmortgage-logs-%{+YYYY.MM.dd}"
    ssl => true
  }
}
```

## Backend Integration

Update backend to ship structured logs to Logstash:

### Environment Variables

```bash
LOGSTASH_HOST=logstash.internal.example.com
LOGSTASH_PORT=8080
```

### Winston Logstash Transport

```typescript
import TransportStream from 'winston-transport';
import axios from 'axios';

class LogstashTransport extends TransportStream {
  private logstashUrl: string;

  constructor(opts: any) {
    super(opts);
    this.logstashUrl = opts.logstashUrl;
  }

  log(info: any, callback: () => void) {
    setImmediate(() => {
      axios.post(this.logstashUrl, info).catch(console.error);
    });
    callback();
  }
}

// Add to Winston logger
logger.add(new LogstashTransport({
  logstashUrl: `http://${process.env.LOGSTASH_HOST}:${process.env.LOGSTASH_PORT}`
}));
```

## Index Lifecycle Management

### Create Index Template

```bash
curl -X PUT "https://<elasticsearch-endpoint>/_index_template/remitmortgage-logs" \
  -H 'Content-Type: application/json' \
  -d '{
    "index_patterns": ["remitmortgage-logs-*"],
    "template": {
      "settings": {
        "number_of_shards": 2,
        "number_of_replicas": 1,
        "index.lifecycle.name": "remitmortgage-policy",
        "index.lifecycle.rollover_alias": "remitmortgage-logs"
      }
    }
  }'
```

### Create Retention Policy

```bash
curl -X PUT "https://<elasticsearch-endpoint>/_ilm/policy/remitmortgage-policy" \
  -H 'Content-Type: application/json' \
  -d '{
    "policy": {
      "phases": {
        "hot": {
          "actions": {
            "rollover": {
              "max_size": "50GB",
              "max_age": "7d"
            }
          }
        },
        "delete": {
          "min_age": "30d",
          "actions": {
            "delete": {}
          }
        }
      }
    }
  }'
```

## Monitoring

### CloudWatch Alarms

Terraform creates log groups. Add alarms for:

```hcl
resource "aws_cloudwatch_metric_alarm" "elasticsearch_cpu" {
  alarm_name          = "elasticsearch-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ES"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Elasticsearch CPU usage above 80%"
  
  dimensions = {
    DomainName = aws_elasticsearch_domain.elk_cluster.domain_name
  }
}
```

### Kibana Dashboards

Access Kibana at the endpoint output and create dashboards for:
- Request latency trends
- Error rate by service
- Transaction volume
- User authentication events

## Scaling

### Horizontal Scaling

```bash
terraform apply -var="elasticsearch_instance_count=5"
```

### Vertical Scaling

```bash
terraform apply -var="elasticsearch_instance_type=r5.xlarge.elasticsearch"
```

⚠️ **Note**: Scaling operations cause brief cluster disruptions (1-2 minutes).

## Backup and Recovery

- **Automated Snapshots**: Configured to run daily at 2 AM UTC
- **Manual Snapshot**:
  ```bash
  curl -X PUT "https://<elasticsearch-endpoint>/_snapshot/cs-automated/manual-snapshot-$(date +%s)"
  ```

## Destroy Infrastructure

⚠️ **Warning**: This permanently deletes all logs and configuration.

```bash
terraform destroy
```

## Cost Estimation

**Example Production Configuration:**
- 3x r5.large.elasticsearch data nodes: ~$380/month
- 3x t3.medium.elasticsearch master nodes: ~$75/month
- 300 GB EBS storage: ~$30/month
- NAT Gateway: ~$32/month
- Data transfer: Variable

**Total**: ~$520/month + data transfer costs

## Troubleshooting

### Connection Issues

Verify security group rules allow traffic from application subnets:
```bash
aws ec2 describe-security-groups --group-ids <sg-id>
```

### Cluster Health

Check cluster status:
```bash
curl -X GET "https://<elasticsearch-endpoint>/_cluster/health?pretty"
```

### Index Issues

List indices:
```bash
curl -X GET "https://<elasticsearch-endpoint>/_cat/indices?v"
```

## Support

For issues or questions:
1. Check Elasticsearch cluster logs in CloudWatch
2. Verify Logstash connectivity from application containers
3. Review security group rules
4. Check IAM role permissions

