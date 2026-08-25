# Terraform Drift Remediation Runbook

When the nightly drift detection workflow reports infrastructure drift, follow this runbook to investigate and resolve it. Drift means Terraform's recorded state no longer matches the live infrastructure — usually caused by a manual change made directly in the AWS console, CLI, or another tool.

---

## 1. Understand the Alert

The `Terraform Drift Detection` workflow opens a GitHub issue and posts a Slack/Discord notification whenever `terraform plan` exits with code `2` (changes detected). The issue contains:

- The affected environment (`dev`, `staging`, `production`, or `multi-region`)
- The Terraform root (`devops/` or `devops/terraform/`)
- A link to the workflow run with a downloadable **plan artifact** showing the exact diff

Download the plan artifact from the linked workflow run before doing anything else.

---

## 2. Classify the Drift

Read through the plan output and categorise each changed resource as one of:

| Class | Description | Action |
|-------|-------------|--------|
| **Authorized** | A deliberate change that was applied manually as an emergency fix and not yet codified | [Reconcile state](#3a-reconcile-authorized-out-of-band-changes) |
| **Unauthorized** | An unexpected or unrecognised change — potential security incident | [Revert immediately](#3b-revert-unauthorized-changes) |
| **Stale state** | Terraform state file is out of sync (e.g. resource was deleted manually) | [Import or remove from state](#3c-fix-stale-state) |

---

## 3. Remediation Procedures

### 3a. Reconcile Authorized Out-of-Band Changes

Use this path when the change was intentional (e.g. a hotfix applied under incident pressure).

1. **Document the change** — add a comment to the GitHub drift issue describing why it was made manually.
2. **Update the Terraform code** to reflect the new desired state.
3. Run `terraform plan` locally to confirm the plan now shows no changes:

   ```bash
   cd devops/                          # or devops/terraform/
   terraform init
   terraform plan -var="environment=production" -var="db_password=<secret>"
   ```

4. Open a PR with the Terraform code changes and get it reviewed.
5. After merge, the next nightly run should report no drift.

> If the change cannot be easily expressed in Terraform, use `terraform import` to bring the live resource under management:
>
> ```bash
> terraform import aws_apprunner_service.app_blue <service-arn>
> ```

---

### 3b. Revert Unauthorized Changes

Use this path when the change is unrecognised or potentially malicious.

1. **Treat as a potential security incident** — notify the security team and preserve evidence (CloudTrail logs, VPC flow logs) before making any changes.
2. Run `terraform apply` to revert the infrastructure back to the last known-good Terraform state:

   ```bash
   cd devops/
   terraform init
   terraform apply \
     -var="environment=production" \
     -var="db_password=<secret>" \
     -auto-approve          # Only use after reviewing the plan carefully
   ```

3. Audit AWS CloudTrail for the IAM principal that made the change:

   ```bash
   aws cloudtrail lookup-events \
     --lookup-attributes AttributeKey=ResourceName,AttributeValue=<resource-id> \
     --start-time $(date -d '48 hours ago' --iso-8601=seconds)
   ```

4. Rotate any credentials associated with the principal if compromise is suspected.
5. Close the drift issue with a post-mortem summary.

---

### 3c. Fix Stale State

Use this path when a resource no longer exists in AWS but is still in the Terraform state file (plan shows a destroy or a create for something that already exists).

**Resource deleted outside Terraform:**

```bash
terraform state rm <resource.address>
# e.g. terraform state rm aws_apprunner_service.app_blue
```

**Resource exists in AWS but not in state:**

```bash
terraform import <resource.address> <aws-resource-id>
# e.g. terraform import aws_elasticache_cluster.redis remit-mortgage-redis-production
```

After either operation, rerun `terraform plan` to confirm a clean state.

---

## 4. Preventing Future Drift

| Control | Description |
|---------|-------------|
| **IAM least-privilege** | Restrict direct AWS console/CLI write access to infrastructure resources in production. Use break-glass IAM roles with mandatory MFA for emergency access. |
| **AWS Config rules** | Enable Config managed rules (e.g. `required-tags`, `restricted-ssh`) to detect non-compliant changes in real time. |
| **Terraform state locking** | Ensure the S3 backend has DynamoDB state locking enabled to prevent concurrent applies. |
| **PR-only applies** | Enforce that `terraform apply` only runs via CI (never from a developer's laptop) for `staging` and `production`. |
| **Drift alerts** | The nightly workflow in `.github/workflows/terraform-drift-detection.yml` already covers this — keep the `DEVOPS_ALERT_WEBHOOK_URL` secret up to date. |

---

## 5. Required Secrets

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM key with read access to all Terraform-managed resources |
| `AWS_SECRET_ACCESS_KEY` | Corresponding secret key |
| `TF_DB_PASSWORD` | RDS master password passed as a Terraform variable |
| `DEVOPS_ALERT_WEBHOOK_URL` | Incoming webhook URL (Slack or Discord) for drift notifications |
| `ALERT_EMAIL_TO` | Email recipient for the multi-region alert variable |

---

## 6. Manual Workflow Trigger

To run a drift check on-demand without waiting for the nightly schedule:

1. Go to **Actions → Terraform Drift Detection → Run workflow**.
2. Optionally select a specific environment, or leave blank to check all.
3. Review the resulting plan artifact and any opened issues.
