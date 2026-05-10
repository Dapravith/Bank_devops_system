// k6 smoke test for banking-devops-platform.
//
// Usage:
//   k6 run loadtest/k6/smoke.js                      # default: 30s, 5 VUs
//   BASE_URL=http://localhost:3000 k6 run ...
//   k6 run --vus 20 --duration 1m loadtest/k6/smoke.js
//
// Asserts:
//   - 99% of /notify return 202
//   - p95 latency < 250ms

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const JWT = __ENV.PARTNER_JWT || '';

const notifyAccepted = new Counter('notify_accepted');
const notifyRejected = new Counter('notify_rejected');
const notifyLatency = new Trend('notify_latency_ms', true);

export const options = {
  vus: Number(__ENV.VUS || 5),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    'http_req_failed':                 ['rate<0.01'],
    'http_req_duration{name:notify}':  ['p(95)<250'],
    'notify_accepted':                 ['count>10'],
  },
};

function makeId() {
  return `K6-${Date.now()}-${__VU}-${__ITER}`;
}

const headers = {
  'Content-Type': 'application/json',
  ...(JWT ? { Authorization: `Bearer ${JWT}` } : {}),
};

export default function () {
  const id = makeId();
  const payload = JSON.stringify({
    transaction_id: id,
    account_id: `ACC-${__VU}`,
    amount: Math.round(Math.random() * 10_000) / 100 + 0.01,
    currency: 'USD',
    status: 'SUCCESS',
    description: 'k6 smoke',
  });

  const res = http.post(`${BASE_URL}/api/v1/transactions/notify`, payload, {
    headers,
    tags: { name: 'notify' },
  });

  notifyLatency.add(res.timings.duration);

  const ok = check(res, {
    'status is 202': (r) => r.status === 202,
    'body has data.transaction_id': (r) => {
      try {
        return JSON.parse(r.body).data.transaction_id === id;
      } catch (_e) {
        return false;
      }
    },
  });

  if (ok) notifyAccepted.add(1);
  else notifyRejected.add(1);

  sleep(0.1);
}

export function handleSummary(data) {
  const accepted = data.metrics.notify_accepted ? data.metrics.notify_accepted.values.count : 0;
  const rejected = data.metrics.notify_rejected ? data.metrics.notify_rejected.values.count : 0;
  // eslint-disable-next-line no-console
  console.log(`\nk6 smoke: accepted=${accepted} rejected=${rejected}`);
  return {
    stdout: JSON.stringify(
      {
        accepted,
        rejected,
        p95_ms: data.metrics['http_req_duration{name:notify}']?.values['p(95)'],
      },
      null,
      2,
    ),
  };
}
