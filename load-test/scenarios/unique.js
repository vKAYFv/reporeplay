import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';
import { browserParams, printVerification, targetUrl } from '../lib/safety.js';

globalThis.__k6Http = http;
const base = targetUrl();
const visitors = Number(__ENV.UNIQUE_VISITORS || 1000);
export const options = {
  scenarios: { unique_visitors: { executor: 'shared-iterations', vus: Number(__ENV.VUS || 100), iterations: visitors, maxDuration: '5m' } },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};
export function setup() {
  const response = http.get(`${base}/api/profiles/unique-test/stats`);
  return { before: response.status === 200 ? response.json() : null };
}
export default function () {
  const response = http.get(`${base}/badge/unique-test.svg`, browserParams(exec.scenario.iterationInTest));
  check(response, { 'badge accepted': (item) => item.status === 200 || item.status === 429 });
}
export function teardown(data) {
  const response = http.get(`${base}/api/profiles/unique-test/stats`);
  printVerification(data.before, response.status === 200 ? response.json() : null, visitors);
  console.log('Expected uniqueness requires NODE_ENV=test and ALLOW_TEST_VISITOR_HEADER=true on the app.');
}
