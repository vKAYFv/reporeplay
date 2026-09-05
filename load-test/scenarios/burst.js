import http from 'k6/http';
import { check } from 'k6';
import { browserParams, targetUrl } from '../lib/safety.js';

const base = targetUrl();
export const options = {
  scenarios: { burst: { executor: 'ramping-vus', startVUs: 0, stages: [
    { duration: __ENV.RAMP_UP || '10s', target: Number(__ENV.PEAK_VUS || 500) },
    { duration: __ENV.HOLD || '20s', target: Number(__ENV.PEAK_VUS || 500) },
    { duration: __ENV.RAMP_DOWN || '10s', target: 0 },
  ], gracefulRampDown: '5s' } },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};
export default function () {
  const response = http.get(`${base}/badge/load-test.svg`, browserParams());
  check(response, { 'badge accepted': (item) => item.status === 200 || item.status === 429 });
}
