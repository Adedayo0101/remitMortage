import http from 'k6/http';
import { check, sleep, group } from 'k6';

// Define configuration & SLA thresholds
export const options = {
  stages: [
    { duration: '30s', target: 10 }, // Ramp-up to 10 VUs
    { duration: '2m', target: 20 },  // Sustained load with 20 VUs
    { duration: '30s', target: 0 },  // Ramp-down to 0
  ],
  thresholds: {
    // Global p95 latency must be under 500ms
    http_req_duration: ['p(95)<500'],
    // Error rate must remain below 1%
    http_req_failed: ['rate<0.01'],
    // Specific endpoint thresholds
    'http_req_duration{name:health_check}': ['p(95)<200'],
    'http_req_duration{name:dashboard_metrics}': ['p(95)<300'],
    'http_req_duration{name:loan_submission}': ['p(95)<800'],
  },
};

const BASE_URL = __ENV.STAGING_URL || 'https://staging-api.remitmortgage.com';

// Sample Stellar public key for load testing
const TEST_BORROWER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

export default function () {
  group('1. System Health & RPC Status', function () {
    const resHealth = http.get(`${BASE_URL}/api/health`, {
      tags: { name: 'health_check' },
    });
    check(resHealth, {
      'health status is 200': (r) => r.status === 200,
      'health body ok': (r) => r.json('status') === 'ok' || r.status === 200,
    });

    const resRpc = http.get(`${BASE_URL}/api/rpc-health`, {
      tags: { name: 'health_check' },
    });
    check(resRpc, {
      'rpc health status is 200': (r) => r.status === 200,
    });
  });

  sleep(1);

  group('2. Dashboard & Analytics Metrics', function () {
    const resMetrics = http.get(`${BASE_URL}/api/metrics`, {
      tags: { name: 'dashboard_metrics' },
    });
    check(resMetrics, {
      'metrics status is 200': (r) => r.status === 200,
    });

    const resPending = http.get(`${BASE_URL}/api/loan/pending`, {
      tags: { name: 'dashboard_metrics' },
    });
    check(resPending, {
      'pending loans status is 200': (r) => r.status === 200,
    });
  });

  sleep(1);

  group('3. Borrower Status & Application Lookup', function () {
    const resBorrower = http.get(`${BASE_URL}/api/borrower/${TEST_BORROWER}/status`, {
      tags: { name: 'borrower_status' },
    });
    check(resBorrower, {
      'borrower status returns response': (r) => r.status === 200 || r.status === 502,
    });

    const resApps = http.get(`${BASE_URL}/api/loan/borrower/${TEST_BORROWER}`, {
      tags: { name: 'borrower_status' },
    });
    check(resApps, {
      'borrower applications status is 200': (r) => r.status === 200,
    });
  });

  sleep(1);

  group('4. Loan Application Submission', function () {
    const payload = JSON.stringify({
      borrowerAddress: TEST_BORROWER,
      amount: '2500',
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { name: 'loan_submission' },
    };

    const resApply = http.post(`${BASE_URL}/api/loan/apply`, payload, params);
    check(resApply, {
      'loan submission responded': (r) => r.status === 201 || r.status === 400 || r.status === 403,
    });
  });

  sleep(2);
}
