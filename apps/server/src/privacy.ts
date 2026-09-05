import { createHash, timingSafeEqual } from 'node:crypto';

export function hashVisitor(ip: string, userAgent: string, profile: string, utcDay: string, secret: string): string {
  return createHash('sha256').update([ip, userAgent, profile, utcDay, secret].join('\0')).digest('hex');
}

export function hashRateLimitIdentity(ip: string, secret: string): string {
  return createHash('sha256').update(`rate\0${ip}\0${secret}`).digest('hex').slice(0, 32);
}

export function isBot(userAgent: string | undefined, headers: Record<string, unknown> = {}): boolean {
  if (!userAgent?.trim()) return true;
  if (headers['x-automated-test'] === 'true' || headers['x-synthetic-traffic'] === 'true') return true;
  return /(bot|crawler|spider|slurp|headless|curl|wget|python-requests|postman|k6\/)/i.test(userAgent);
}

export function secretsMatch(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
