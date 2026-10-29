# Security Scanning

This document describes the automated security scanning pipeline for the RemitMortgage codebase.

## Pipeline Overview

Security scans run in CI on every PR and periodically on the main branch. The pipeline covers:

- **Static analysis** - ESLint with security plugins, TypeScript strict checks
- **Dependency scanning** - `npm audit` and Snyk for known vulnerabilities in dependencies
- **Smart contract auditing** - Soroban-specific linting and manual review gates
- **Secret detection** - GitLeaks or equivalent for accidental credential commits

## Scan Results

Findings are categorized as:

| Severity | Action |
|----------|--------|
| Critical | Blocks merge, requires immediate fix |
| High     | Blocks merge, requires fix or documented exception |
| Medium   | Warning, should be addressed before release |
| Low      | Informational, tracked in backlog |

## Local Scanning

Run security checks locally before pushing:

```bash
npm run lint:security
npm audit
```
