import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';
import { browserParams, printVerification, targetUrl } from '../lib/safety.js';

globalThis.__k6Http = http;
const base = targetUrl();
const visitors = Number(__ENV.REPEAT_VISITORS || 100);
const perVisitor = Number(__ENV.REQUESTS_PER_VISITOR || 1000);
const total = visitors * perVisitor;
export const options = {
  scenarios: { repeat_visitors: { executor: 'shared-iterations', vus: Number(__ENV.VUS || 100), iterations: total, maxDuration: '10m' } },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};
export function setup() {
  const response = http.get(`${base}/api/profiles/repeat-test/stats`);
  return { before: response.status === 200 ? response.json() : null };
}
export default function () {
  const visitor = exec.scenario.iterationInTest % visitors;
  const response = http.get(`${base}/badge/repeat-test.svg`, browserParams(visitor));
  check(response, { 'badge accepted': (item) => item.status === 200 || item.status === 429 });
}
export function teardown(data) {
  const response = http.get(`${base}/api/profiles/repeat-test/stats`);
  const after = response.status === 200 ? response.json() : null;
  printVerification(data.before, after, total);
  if (after && data.before) console.log(`unique delta: ${after.uniqueViews - data.before.uniqueViews} (expected ${visitors} for a fresh profile)`);
  console.log('Expected uniqueness requires NODE_ENV=test and ALLOW_TEST_VISITOR_HEADER=true on the app.');
}
