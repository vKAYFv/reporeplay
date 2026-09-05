import http from 'k6/http';
import { check } from 'k6';
import { browserParams, printVerification, targetUrl } from '../lib/safety.js';

globalThis.__k6Http = http;
const base = targetUrl();
const total = Number(__ENV.TOTAL_REQUESTS || 100000);
const vus = Number(__ENV.VUS || 100);

export const options = {
  scenarios: { exact_requests: { executor: 'shared-iterations', vus, iterations: total, maxDuration: '10m' } },
  thresholds: { http_req_failed: ['rate<0.01'] },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  const response = http.get(`${base}/api/profiles/load-test/stats`);
  return { before: response.status === 200 ? response.json() : null };
}

export default function () {
  const response = http.get(`${base}/badge/load-test.svg`, browserParams());
  check(response, { 'badge accepted': (item) => item.status === 200 || item.status === 429 });
}

export function teardown(data) {
  const response = http.get(`${base}/api/profiles/load-test/stats`);
  printVerification(data.before, response.status === 200 ? response.json() : null, total);
}
