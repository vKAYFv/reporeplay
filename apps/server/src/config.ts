import { z } from 'zod';

const booleanFromEnv = z.union([z.boolean(), z.enum(['true', 'false'])]).transform((value) => value === true || value === 'true');
const positiveInt = z.coerce.number().int().positive();

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  REDIS_URL: z.url().default('redis://redis:6379'),
  COUNT_MODE: z.enum(['raw', 'unique', 'hybrid']).default('unique'),
  COUNT_BOTS: booleanFromEnv.default(false),
  UNIQUE_VIEW_TTL_SECONDS: positiveInt.default(86_400),
  VIEW_COOLDOWN_SECONDS: positiveInt.default(300),
  UNIQUE_HASH_SECRET: z.string().min(16).default('local-development-secret-change-me'),
  RATE_LIMIT_ENABLED: booleanFromEnv.default(true),
  RATE_LIMIT_PER_IP_PER_MINUTE: positiveInt.default(100),
  RATE_LIMIT_GLOBAL_PER_MINUTE: positiveInt.default(10_000),
  ADMIN_API_KEY: z.string().min(16).default('local-admin-key-change-me'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ALLOW_TEST_VISITOR_HEADER: booleanFromEnv.default(false),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env) {
  const config = environmentSchema.parse(environment);
  return {
    nodeEnv: config.NODE_ENV,
    port: config.PORT,
    host: config.HOST,
    redisUrl: config.REDIS_URL,
    countMode: config.COUNT_MODE,
    countBots: config.COUNT_BOTS,
    uniqueViewTtlSeconds: config.UNIQUE_VIEW_TTL_SECONDS,
    viewCooldownSeconds: config.VIEW_COOLDOWN_SECONDS,
    uniqueHashSecret: config.UNIQUE_HASH_SECRET,
    rateLimitEnabled: config.RATE_LIMIT_ENABLED,
    rateLimitPerIpPerMinute: config.RATE_LIMIT_PER_IP_PER_MINUTE,
    rateLimitGlobalPerMinute: config.RATE_LIMIT_GLOBAL_PER_MINUTE,
    adminApiKey: config.ADMIN_API_KEY,
    logLevel: config.LOG_LEVEL,
    allowTestVisitorHeader: config.ALLOW_TEST_VISITOR_HEADER,
  } as const;
}
