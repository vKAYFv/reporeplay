import { describe, expect, it } from 'vitest';
import { hashVisitor, isBot, secretsMatch } from './privacy.js';

describe('privacy helpers', () => {
  it('creates stable but day-scoped fingerprints without exposing inputs', () => {
    const first = hashVisitor('127.0.0.1', 'browser', 'profile', '2026-09-05', 'secret');
    expect(first).toHaveLength(64);
    expect(first).toBe(hashVisitor('127.0.0.1', 'browser', 'profile', '2026-09-05', 'secret'));
    expect(first).not.toBe(hashVisitor('127.0.0.1', 'browser', 'profile', '2026-09-06', 'secret'));
    expect(first).not.toContain('127.0.0.1');
  });

  it.each([undefined, '', 'curl/8.0', 'Googlebot/2.1'])('detects bots from %s', (agent) => expect(isBot(agent)).toBe(true));
  it('keeps normal browsers eligible', () => expect(isBot('Mozilla/5.0 Safari/605.1')).toBe(false));
  it('compares API keys safely', () => {
    expect(secretsMatch('same-secret-value', 'same-secret-value')).toBe(true);
    expect(secretsMatch('wrong', 'same-secret-value')).toBe(false);
  });
});
