# Webhook Signatures

Outgoing webhooks are signed so that consumers can verify they originated from RemitMortgage.

## Signature Format

Each webhook request includes the following headers:

- `X-Remit-Signature` - HMAC-SHA256 signature of the request body
- `X-Remit-Timestamp` - Unix timestamp of when the webhook was sent
- `X-Remit-Webhook-Id` - Unique event identifier (UUID)

## Verification

Consumers should:

1. Read the raw request body.
2. Concatenate the timestamp, webhook ID, and body separated by `.`.
3. Compute HMAC-SHA256 over the concatenated string using the shared secret.
4. Compare the result (hex-encoded) against the `X-Remit-Signature` header using a constant-time comparison.

```ts
const expected = crypto
  .createHmac("sha256", secret)
  .update(`${timestamp}.${webhookId}.${body}`)
  .digest("hex");
```

## Retry Policy

If a consumer responds with a non-2xx status, the webhook is retried up to 3 times with exponential backoff (1m, 5m, 30m).

## Configuration

Set `WEBHOOK_SECRET` in the backend environment to a strong, unique value.
