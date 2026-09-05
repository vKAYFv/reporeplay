import type { Logger } from 'pino';
import { createClient, type RedisClientType } from 'redis';
import { priorPeriods, utcDay, utcHour, utcMinute, type CountMode, type HistoryPoint, type ProfileStats } from '@kayf/profile-counter-shared';

const RECORD_VIEW_SCRIPT = `
redis.call('SADD', KEYS[1], ARGV[1])
redis.call('INCR', KEYS[2])
redis.call('HINCRBY', KEYS[7], 'raw', 1)
redis.call('HINCRBY', KEYS[8], 'raw', 1)
redis.call('HINCRBY', KEYS[9], 'raw', 1)
redis.call('EXPIRE', KEYS[7], 8640000)
redis.call('EXPIRE', KEYS[8], 259200)
redis.call('EXPIRE', KEYS[9], 7200)

if ARGV[5] == '1' then
  local ipRate = redis.call('INCR', KEYS[12])
  local globalRate = redis.call('INCR', KEYS[13])
  if ipRate == 1 then redis.call('EXPIRE', KEYS[12], 120) end
  if globalRate == 1 then redis.call('EXPIRE', KEYS[13], 120) end
  if ipRate > tonumber(ARGV[6]) or globalRate > tonumber(ARGV[7]) then
    redis.call('INCR', KEYS[6])
    redis.call('HINCRBY', KEYS[7], 'rateLimited', 1)
    redis.call('HINCRBY', KEYS[8], 'rateLimited', 1)
    redis.call('HINCRBY', KEYS[9], 'rateLimited', 1)
    return {0, 0, 0, 1}
  end
end

local bot = ARGV[8] == '1'
if bot then
  redis.call('INCR', KEYS[5])
  redis.call('HINCRBY', KEYS[7], 'bot', 1)
  redis.call('HINCRBY', KEYS[8], 'bot', 1)
  redis.call('HINCRBY', KEYS[9], 'bot', 1)
  if ARGV[9] ~= '1' then return {0, 0, 1, 0} end
end

local unique = redis.call('SET', KEYS[10], '1', 'EX', tonumber(ARGV[11]), 'NX')
local isUnique = unique and 1 or 0
if isUnique == 1 then
  redis.call('INCR', KEYS[4])
  redis.call('HINCRBY', KEYS[7], 'unique', 1)
  redis.call('HINCRBY', KEYS[8], 'unique', 1)
  redis.call('HINCRBY', KEYS[9], 'unique', 1)
else
  redis.call('INCR', KEYS[14])
  redis.call('HINCRBY', KEYS[7], 'repeat', 1)
  redis.call('HINCRBY', KEYS[8], 'repeat', 1)
  redis.call('HINCRBY', KEYS[9], 'repeat', 1)
end

local shouldCount = ARGV[10] == 'raw' or (ARGV[10] == 'unique' and isUnique == 1)
if ARGV[10] == 'hybrid' then
  shouldCount = redis.call('SET', KEYS[11], '1', 'EX', tonumber(ARGV[12]), 'NX') and true or false
end
if shouldCount then
  redis.call('INCR', KEYS[3])
  redis.call('HINCRBY', KEYS[7], 'counted', 1)
  redis.call('HINCRBY', KEYS[8], 'counted', 1)
  redis.call('HINCRBY', KEYS[9], 'counted', 1)
  return {1, isUnique, bot and 1 or 0, 0}
end
return {0, isUnique, bot and 1 or 0, 0}
`;

export interface RecordViewInput {
  profile: string;
  fingerprint: string;
  rateIdentity: string;
  bot: boolean;
  now?: Date;
  countMode: CountMode;
  countBots: boolean;
  uniqueTtlSeconds: number;
  cooldownSeconds: number;
  rateLimitEnabled: boolean;
  rateLimitPerIp: number;
  rateLimitGlobal: number;
}

export interface RecordViewResult {
  counted: boolean;
  unique: boolean;
  bot: boolean;
  rateLimited: boolean;
  count: number;
}

export interface CounterStore {
  connect(): Promise<void>;
  close(): Promise<void>;
  ping(): Promise<boolean>;
  recordView(input: RecordViewInput): Promise<RecordViewResult>;
  getStats(profile: string, now?: Date): Promise<ProfileStats>;
  getProfiles(now?: Date): Promise<ProfileStats[]>;
  reset(profile: string, scope: ResetScope): Promise<void>;
}

export type ResetScope = 'all' | 'raw' | 'counted' | 'unique' | 'analytics';

const numberValue = (value: string | null | undefined): number => Number(value ?? 0);
const key = (profile: string, suffix: string): string => `pv:profile:${profile}:${suffix}`;

function historyPoint(period: string, values: Record<string, string>): HistoryPoint {
  return {
    period,
    raw: numberValue(values.raw),
    counted: numberValue(values.counted),
    unique: numberValue(values.unique),
    repeat: numberValue(values.repeat),
    bot: numberValue(values.bot),
    rateLimited: numberValue(values.rateLimited),
  };
}

export class RedisCounterStore implements CounterStore {
  readonly client: RedisClientType;
  private connectPromise: Promise<void> | undefined;

  constructor(url: string, private readonly logger: Logger) {
    this.client = createClient({
      url,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 3_000,
        reconnectStrategy: (retries) => Math.min(100 * 2 ** Math.min(retries, 6), 5_000),
      },
    });
    this.client.on('error', (error) => this.logger.error({ err: error }, 'Redis connection error'));
    this.client.on('reconnecting', () => this.logger.warn('Redis reconnecting'));
    this.client.on('ready', () => this.logger.info('Redis connected'));
  }

  async connect(): Promise<void> {
    if (this.client.isReady) return;
    this.connectPromise ??= this.client.connect().then(() => undefined).finally(() => { this.connectPromise = undefined; });
    await this.connectPromise;
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.close();
  }

  async ping(): Promise<boolean> {
    if (!this.client.isReady) return false;
    try { return (await this.client.ping()) === 'PONG'; } catch { return false; }
  }

  async recordView(input: RecordViewInput): Promise<RecordViewResult> {
    const now = input.now ?? new Date();
    const day = utcDay(now);
    const hour = utcHour(now);
    const minute = utcMinute(now);
    const keys = [
      'pv:profiles', key(input.profile, 'raw'), key(input.profile, 'counted'), key(input.profile, 'unique'),
      key(input.profile, 'bot'), key(input.profile, 'ratelimited'), key(input.profile, `day:${day}`),
      key(input.profile, `hour:${hour}`), key(input.profile, `minute:${minute}`),
      key(input.profile, `visitor:${input.fingerprint}`), key(input.profile, `cooldown:${input.fingerprint}`),
      `pv:rate:ip:${minute}:${input.rateIdentity}`, `pv:rate:global:${minute}`,
      key(input.profile, 'repeat'),
    ];
    const result = await this.client.eval(RECORD_VIEW_SCRIPT, {
      keys,
      arguments: [input.profile, '8640000', '259200', '7200', input.rateLimitEnabled ? '1' : '0',
        String(input.rateLimitPerIp), String(input.rateLimitGlobal), input.bot ? '1' : '0', input.countBots ? '1' : '0',
        input.countMode, String(input.uniqueTtlSeconds), String(input.cooldownSeconds)],
    }) as number[];
    const count = numberValue(await this.client.get(key(input.profile, 'counted')));
    return { counted: result[0] === 1, unique: result[1] === 1, bot: result[2] === 1, rateLimited: result[3] === 1, count };
  }

  async getStats(profile: string, now = new Date()): Promise<ProfileStats> {
    const minutePeriods = priorPeriods('minute', 60, now);
    const hourPeriods = priorPeriods('hour', 24, now);
    const dayPeriods = priorPeriods('day', 30, now);
    const [raw, counted, unique, repeat, bot, rateLimited, minuteRows, hourRows, dayRows] = await Promise.all([
      this.client.get(key(profile, 'raw')), this.client.get(key(profile, 'counted')),
      this.client.get(key(profile, 'unique')), this.client.get(key(profile, 'repeat')),
      this.client.get(key(profile, 'bot')),
      this.client.get(key(profile, 'ratelimited')),
      Promise.all(minutePeriods.map((period) => this.client.hGetAll(key(profile, `minute:${period}`)))),
      Promise.all(hourPeriods.map((period) => this.client.hGetAll(key(profile, `hour:${period}`)))),
      Promise.all(dayPeriods.map((period) => this.client.hGetAll(key(profile, `day:${period}`)))),
    ]);
    const trafficLast60Minutes = minutePeriods.map((period, index) => historyPoint(period, minuteRows[index] ?? {}));
    const hourly = hourPeriods.map((period, index) => historyPoint(period, hourRows[index] ?? {}));
    const daily = dayPeriods.map((period, index) => historyPoint(period, dayRows[index] ?? {}));
    const rawRequests = numberValue(raw);
    const uniqueViews = numberValue(unique);
    return {
      profile, rawRequests, countedViews: numberValue(counted), uniqueViews,
      repeatViews: numberValue(repeat),
      botRequests: numberValue(bot), rateLimited: numberValue(rateLimited),
      requestsPerMinute: trafficLast60Minutes.at(-1)?.raw ?? 0,
      requestsPerHour: hourly.at(-1)?.raw ?? 0,
      viewsToday: daily.at(-1)?.counted ?? 0,
      viewsLast24h: hourly.reduce((sum, point) => sum + point.counted, 0),
      last7Days: daily.slice(-7), last30Days: daily, trafficLast60Minutes,
    };
  }

  async getProfiles(now = new Date()): Promise<ProfileStats[]> {
    const profiles = (await this.client.sMembers('pv:profiles')).sort((a, b) => a.localeCompare(b));
    return Promise.all(profiles.map((profile) => this.getStats(profile, now)));
  }

  async reset(profile: string, scope: ResetScope): Promise<void> {
    const suffixes: Record<Exclude<ResetScope, 'all' | 'analytics'>, string> = { raw: 'raw', counted: 'counted', unique: 'unique' };
    if (scope in suffixes) {
      await this.client.del(key(profile, suffixes[scope as keyof typeof suffixes]));
      return;
    }
    const patterns = scope === 'analytics'
      ? [`${key(profile, 'minute:')}*`, `${key(profile, 'hour:')}*`, `${key(profile, 'day:')}*`]
      : [`${key(profile, '')}*`];
    for (const pattern of patterns) {
      for await (const keys of this.client.scanIterator({ MATCH: pattern, COUNT: 500 })) {
        if (keys.length > 0) await this.client.del(keys);
      }
    }
    if (scope === 'all') await this.client.sRem('pv:profiles', profile);
  }
}
