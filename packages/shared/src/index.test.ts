import { describe, expect, it } from 'vitest';
import { priorPeriods, profileSchema } from './index.js';

describe('profile validation', () => {
  it.each(['vKAYFv', 'load-test', 'a', 'user123'])("accepts %s", (profile) => {
    expect(profileSchema.parse(profile)).toBe(profile);
  });

  it.each(['-bad', 'bad-', 'bad/name', '', 'a'.repeat(40)])('rejects %s', (profile) => {
    expect(profileSchema.safeParse(profile).success).toBe(false);
  });
});

it('creates ordered UTC periods', () => {
  expect(priorPeriods('hour', 3, new Date('2026-09-05T03:30:00Z'))).toEqual([
    '2026-09-05T01',
    '2026-09-05T02',
    '2026-09-05T03',
  ]);
});
