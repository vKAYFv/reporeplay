import { z } from 'zod';

export const profileSchema = z
  .string()
  .min(1)
  .max(39)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/, 'Invalid profile name');

export const countModeSchema = z.enum(['raw', 'unique', 'hybrid']);
export type CountMode = z.infer<typeof countModeSchema>;

export interface HistoryPoint {
  period: string;
  raw: number;
  counted: number;
  unique: number;
  repeat: number;
  bot: number;
  rateLimited: number;
}

export interface ProfileStats {
  profile: string;
  rawRequests: number;
  countedViews: number;
  uniqueViews: number;
  repeatViews: number;
  botRequests: number;
  rateLimited: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  viewsToday: number;
  viewsLast24h: number;
  last7Days: HistoryPoint[];
  last30Days: HistoryPoint[];
  trafficLast60Minutes: HistoryPoint[];
}

export const utcMinute = (date = new Date()): string => date.toISOString().slice(0, 16);
export const utcHour = (date = new Date()): string => date.toISOString().slice(0, 13);
export const utcDay = (date = new Date()): string => date.toISOString().slice(0, 10);

export function priorPeriods(kind: 'minute' | 'hour' | 'day', count: number, now = new Date()): string[] {
  const interval = kind === 'minute' ? 60_000 : kind === 'hour' ? 3_600_000 : 86_400_000;
  const formatter = kind === 'minute' ? utcMinute : kind === 'hour' ? utcHour : utcDay;
  return Array.from({ length: count }, (_, index) => formatter(new Date(now.getTime() - (count - index - 1) * interval)));
}
