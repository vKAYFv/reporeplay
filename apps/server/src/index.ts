import pino from 'pino';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { RedisCounterStore } from './store.js';

const config = loadConfig();
const bootstrapLogger = pino({ level: config.logLevel });
const store = new RedisCounterStore(config.redisUrl, bootstrapLogger);

store.connect().catch((error) => bootstrapLogger.error({ err: error }, 'Initial Redis connection failed; reconnect will continue'));

const app = buildApp(config, store);
await app.listen({ port: config.port, host: config.host });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Shutting down');
  await app.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
