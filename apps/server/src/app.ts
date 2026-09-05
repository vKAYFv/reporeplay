import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Fastify, { LogController } from 'fastify';
import fastifyStatic from '@fastify/static';
import pino from 'pino';
import { z, ZodError } from 'zod';
import { renderBadge } from '@kayf/profile-counter-badge-renderer';
import { profileSchema, utcDay } from '@kayf/profile-counter-shared';
import type { AppConfig } from './config.js';
import { hashRateLimitIdentity, hashVisitor, isBot, secretsMatch } from './privacy.js';
import type { CounterStore, ResetScope } from './store.js';

const badgeQuerySchema = z.object({
  label: z.string().min(1).max(40).default('PROFILE VIEWS'),
  style: z.enum(['flat', 'flat-square', 'for-the-badge']).default('for-the-badge'),
  color: z.string().regex(/^#?[0-9a-fA-F]{6}$/).transform((value) => value.replace('#', '')).default('f7b93e'),
  labelColor: z.string().regex(/^#?[0-9a-fA-F]{6}$/).transform((value) => value.replace('#', '')).default('1a1b27'),
  increment: z.enum(['true', 'false']).transform((value) => value === 'true').default(true),
  compact: z.enum(['true', 'false']).transform((value) => value === 'true').default(false),
});
const resetSchema = z.object({ scope: z.enum(['all', 'raw', 'counted', 'unique', 'analytics']).default('all') });

const singleHeader = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value;

function adminKey(headers: { [key: string]: string | string[] | undefined }): string {
  const direct = singleHeader(headers['x-api-key']);
  const authorization = singleHeader(headers.authorization);
  return direct ?? (authorization?.startsWith('Bearer ') ? authorization.slice(7) : '');
}

function dashboardRoot(): string | undefined {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDirectory, '../public/admin'),
    path.resolve(currentDirectory, '../../dashboard/dist'),
  ];
  return candidates.find((candidate) => existsSync(path.join(candidate, 'index.html')));
}

export function buildApp(config: AppConfig, store: CounterStore) {
  const logger = pino({ level: config.logLevel, redact: ['req.headers.authorization', 'req.headers.x-api-key'] });
  const app = Fastify({ loggerInstance: logger, logController: new LogController({ disableRequestLogging: true }), trustProxy: false });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'");
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid request', issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
    }
    request.log.error({ err: error, route: request.routeOptions.url }, 'Request failed');
    return reply.code(503).send({ error: 'Service temporarily unavailable' });
  });

  app.get('/', async () => ({
    service: 'kayf-profile-counter',
    badge: '/badge/vKAYFv.svg',
    stats: '/api/profiles/vKAYFv/stats',
    admin: '/admin',
    health: '/health',
  }));

  app.get('/health', async (_request, reply) => {
    const connected = await store.ping();
    if (!connected) reply.code(503);
    return { status: connected ? 'ok' : 'unhealthy', redis: connected ? 'connected' : 'disconnected', uptimeSeconds: Math.floor(process.uptime()) };
  });

  app.get<{ Params: { profile: string }; Querystring: Record<string, unknown> }>('/badge/:profile.svg', async (request, reply) => {
    const profile = profileSchema.parse(request.params.profile);
    const query = badgeQuerySchema.parse(request.query);
    let count: number;
    let result: Awaited<ReturnType<CounterStore['recordView']>> | undefined;
    if (query.increment) {
      const now = new Date();
      const userAgent = singleHeader(request.headers['user-agent']) ?? '';
      const testVisitor = config.nodeEnv === 'test' && config.allowTestVisitorHeader
        ? singleHeader(request.headers['x-test-visitor-id'])
        : undefined;
      const identity = testVisitor ?? request.ip;
      result = await store.recordView({
        profile,
        fingerprint: hashVisitor(identity, userAgent, profile, utcDay(now), config.uniqueHashSecret),
        rateIdentity: hashRateLimitIdentity(identity, config.uniqueHashSecret),
        bot: isBot(userAgent, request.headers),
        now,
        countMode: config.countMode,
        countBots: config.countBots,
        uniqueTtlSeconds: config.uniqueViewTtlSeconds,
        cooldownSeconds: config.viewCooldownSeconds,
        rateLimitEnabled: config.rateLimitEnabled,
        rateLimitPerIp: config.rateLimitPerIpPerMinute,
        rateLimitGlobal: config.rateLimitGlobalPerMinute,
      });
      count = result.count;
    } else {
      count = (await store.getStats(profile)).countedViews;
    }
    const svg = renderBadge({ ...query, count });
    request.log.debug({ requestId: request.id, profile, route: '/badge/:profile.svg', counted: result?.counted ?? false,
      unique: result?.unique ?? false, bot: result?.bot ?? false, rateLimited: result?.rateLimited ?? false }, 'Badge served');
    if (result?.rateLimited) reply.code(429).header('Retry-After', '60');
    return reply
      .type('image/svg+xml; charset=utf-8')
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .send(svg);
  });

  app.get<{ Params: { profile: string } }>('/api/profiles/:profile/stats', async (request) => {
    const profile = profileSchema.parse(request.params.profile);
    return store.getStats(profile);
  });

  app.get('/api/admin/profiles', async (request, reply) => {
    if (!secretsMatch(adminKey(request.headers), config.adminApiKey)) return reply.code(401).send({ error: 'Unauthorized' });
    return { profiles: await store.getProfiles() };
  });

  app.post<{ Params: { profile: string }; Body: unknown }>('/api/profiles/:profile/reset', async (request, reply) => {
    if (!secretsMatch(adminKey(request.headers), config.adminApiKey)) return reply.code(401).send({ error: 'Unauthorized' });
    const profile = profileSchema.parse(request.params.profile);
    const { scope } = resetSchema.parse(request.body ?? {});
    await store.reset(profile, scope as ResetScope);
    return { ok: true, profile, scope };
  });

  const staticRoot = dashboardRoot();
  if (staticRoot) {
    void app.register(fastifyStatic, { root: staticRoot, prefix: '/admin/', decorateReply: true });
    app.get('/admin', async (_request, reply) => reply.redirect('/admin/'));
  } else {
    app.get('/admin', async (_request, reply) => reply.code(503).send({ error: 'Dashboard assets have not been built' }));
  }

  app.addHook('onClose', async () => store.close());
  return app;
}
