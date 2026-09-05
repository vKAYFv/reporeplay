import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisCounterStore, type RecordViewInput } from './store.js';

const redisUrl = process.env.TEST_REDIS_URL;
const integration = redisUrl ? describe : describe.skip;
const logger = pino({ level: 'silent' });

integration('Redis counter integration', () => {
  const store = new RedisCounterStore(redisUrl!, logger);
  const profiles: string[] = [];
  const profile = (name: string) => {
    const value = `test-${name}-${Math.random().toString(36).slice(2, 9)}`;
    profiles.push(value);
    return value;
  };
  const input = (profileName: string, overrides: Partial<RecordViewInput> = {}): RecordViewInput => ({
    profile: profileName, fingerprint: 'visitor-a', rateIdentity: 'rate-a', bot: false,
    countMode: 'unique', countBots: false, uniqueTtlSeconds: 86_400, cooldownSeconds: 300,
    rateLimitEnabled: false, rateLimitPerIp: 100, rateLimitGlobal: 10_000, ...overrides,
  });

  beforeAll(async () => store.connect());
  afterAll(async () => {
    for (const name of profiles) await store.reset(name, 'all');
    await store.close();
  });

  it('does not lose any of 10,000 concurrent raw increments', { timeout: 60_000 }, async () => {
    const name = profile('concurrency');
    await Promise.all(Array.from({ length: 10_000 }, (_, index) => store.recordView(input(name, {
      fingerprint: `visitor-${index}`, rateIdentity: `rate-${index}`, countMode: 'raw',
    }))));
    const stats = await store.getStats(name);
    expect(stats.rawRequests).toBe(10_000);
    expect(stats.countedViews).toBe(10_000);
    expect(stats.uniqueViews).toBe(10_000);
  });

  it('counts repeat visitors according to each counting mode', async () => {
    const uniqueName = profile('unique');
    await Promise.all(Array.from({ length: 50 }, () => store.recordView(input(uniqueName))));
    expect(await store.getStats(uniqueName)).toMatchObject({ rawRequests: 50, countedViews: 1, uniqueViews: 1, repeatViews: 49 });

    const rawName = profile('raw');
    await Promise.all(Array.from({ length: 50 }, () => store.recordView(input(rawName, { countMode: 'raw' }))));
    expect(await store.getStats(rawName)).toMatchObject({ rawRequests: 50, countedViews: 50, uniqueViews: 1 });

    const hybridName = profile('hybrid');
    await Promise.all(Array.from({ length: 50 }, () => store.recordView(input(hybridName, { countMode: 'hybrid' }))));
    expect(await store.getStats(hybridName)).toMatchObject({ rawRequests: 50, countedViews: 1, uniqueViews: 1 });
  });

  it('expires unique and hybrid cooldown keys', { timeout: 10_000 }, async () => {
    const uniqueName = profile('ttl');
    await store.recordView(input(uniqueName, { uniqueTtlSeconds: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await store.recordView(input(uniqueName, { uniqueTtlSeconds: 1 }));
    expect(await store.getStats(uniqueName)).toMatchObject({ countedViews: 2, uniqueViews: 2 });

    const hybridName = profile('cooldown');
    await store.recordView(input(hybridName, { countMode: 'hybrid', cooldownSeconds: 1 }));
    await store.recordView(input(hybridName, { countMode: 'hybrid', cooldownSeconds: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await store.recordView(input(hybridName, { countMode: 'hybrid', cooldownSeconds: 1 }));
    expect((await store.getStats(hybridName)).countedViews).toBe(2);
  });

  it('filters bots and enforces per-identity rate limits', async () => {
    const botName = profile('bot');
    await store.recordView(input(botName, { bot: true }));
    expect(await store.getStats(botName)).toMatchObject({ rawRequests: 1, countedViews: 0, botRequests: 1 });

    const rateName = profile('rate');
    const rateInput = input(rateName, { countMode: 'raw', rateLimitEnabled: true, rateLimitPerIp: 2, rateLimitGlobal: 1_000_000 });
    await store.recordView(rateInput); await store.recordView(rateInput); await store.recordView(rateInput);
    expect(await store.getStats(rateName)).toMatchObject({ rawRequests: 3, countedViews: 2, rateLimited: 1 });
  });

  it('can close and establish a fresh Redis connection', async () => {
    const another = new RedisCounterStore(redisUrl!, logger);
    await another.connect();
    expect(await another.ping()).toBe(true);
    await another.close();
  });
});
