# API Idempotency

Some RemitMortgage API endpoints guarantee idempotent processing to prevent duplicate operations (e.g., double-charging a loan repayment).

## How It Works

Clients include an `Idempotency-Key` header on mutating requests. The backend deduplicates based on this key:

1. If the key has not been seen, the request is processed normally and the response is cached keyed by the idempotency key.
2. If the same key is sent again within the TTL window, the cached response is returned without re-executing the operation.
3. After the TTL expires, the key can be reused.

## Supported Endpoints

- `POST /api/loan/repay`
- `POST /api/escrow/deposit`
- `POST /api/milestone/propose`

## Client Guidance

Generate a unique UUID v4 for each request. Retry-safe operations should reuse the same key on retry.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `IDEMPOTENCY_TTL_SECONDS` | How long a key is cached | `86400` (24h) |
| `IDEMPOTENCY_REDIS_PREFIX` | Redis key prefix | `idempotency:` |
