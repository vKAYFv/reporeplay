import { describe, expect, it } from 'vitest';
import type { ProfileStats } from '@kayf/profile-counter-shared';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import type { CounterStore, RecordViewResult, ResetScope } from './store.js';

const emptyStats = (profile: string): ProfileStats => ({
  profile, rawRequests: 0, countedViews: 0, uniqueViews: 0, repeatViews: 0, botRequests: 0,
  rateLimited: 0, requestsPerMinute: 0, requestsPerHour: 0, viewsToday: 0, viewsLast24h: 0,
  last7Days: [], last30Days: [], trafficLast60Minutes: [],
});

class FakeStore implements CounterStore {
  connected = true;
  result: RecordViewResult = { counted: true, unique: true, bot: false, rateLimited: false, count: 1 };
  resetCalls: Array<[string, ResetScope]> = [];
  async connect() {}
  async close() {}
  async ping() { return this.connected; }
  async recordView() { return this.result; }
  async getStats(profile: string) { return emptyStats(profile); }
  async getProfiles() { return [emptyStats('vKAYFv')]; }
  async reset(profile: string, scope: ResetScope) { this.resetCalls.push([profile, scope]); }
}

const config = loadConfig({ ADMIN_API_KEY: 'test-admin-key-long-enough', UNIQUE_HASH_SECRET: 'test-hash-secret-long-enough', NODE_ENV: 'test' });

describe('HTTP application', () => {
  it('reports dependency health', async () => {
    const store = new FakeStore();
    const app = buildApp(config, store);
    expect((await app.inject('/health')).statusCode).toBe(200);
    store.connected = false;
    expect((await app.inject('/health')).statusCode).toBe(503);
    await app.close();
  });

  it('serves a no-cache SVG and validates profiles', async () => {
    const app = buildApp(config, new FakeStore());
    const response = await app.inject('/badge/vKAYFv.svg?label=%3Cviews%3E');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
    expect(response.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
    expect(response.body).toContain('&lt;VIEWS&gt;');
    expect((await app.inject('/badge/-bad.svg')).statusCode).toBe(400);
    await app.close();
  });

  it('protects admin reads and reset actions', async () => {
    const store = new FakeStore();
    const app = buildApp(config, store);
    expect((await app.inject('/api/admin/profiles')).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/admin/profiles', headers: { 'x-api-key': config.adminApiKey } })).statusCode).toBe(200);
    const reset = await app.inject({ method: 'POST', url: '/api/profiles/vKAYFv/reset', headers: { authorization: `Bearer ${config.adminApiKey}` }, payload: { scope: 'analytics' } });
    expect(reset.statusCode).toBe(200);
    expect(store.resetCalls).toEqual([['vKAYFv', 'analytics']]);
    await app.close();
  });

  it('returns 429 while retaining an SVG body when limited', async () => {
    const store = new FakeStore();
    store.result = { counted: false, unique: false, bot: false, rateLimited: true, count: 4 };
    const app = buildApp(config, store);
    const response = await app.inject('/badge/vKAYFv.svg');
    expect(response.statusCode).toBe(429);
    expect(response.body).toContain('<svg');
    await app.close();
  });
});
