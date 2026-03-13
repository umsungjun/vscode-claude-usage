import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const STATS_PATH = path.join(os.homedir(), '.claude', 'stats-cache.json');

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
}

export interface DailyEntry {
  date: string;
  tokensByModel: Record<string, number>;
}

export interface Stats {
  modelUsage: Record<string, ModelUsage>;
  dailyModelTokens: DailyEntry[];
  totalSessions: number;
  totalMessages: number;
}

export function readStats(): Stats | null {
  try {
    const raw = fs.readFileSync(STATS_PATH, 'utf-8');
    return JSON.parse(raw) as Stats;
  } catch {
    return null;
  }
}

/** Total tokens used today (UTC date) */
export function getTodayTokens(stats: Stats): number {
  const today = new Date().toISOString().split('T')[0];
  const entry = stats.dailyModelTokens?.find((d) => d.date === today);
  if (!entry) return 0;
  return Object.values(entry.tokensByModel).reduce((sum, v) => sum + v, 0);
}

/** Total cumulative tokens across all models (input + output + cache) */
export function getTotalTokens(stats: Stats): number {
  return Object.values(stats.modelUsage ?? {}).reduce((sum, m) => {
    return (
      sum + m.inputTokens + m.outputTokens + m.cacheReadInputTokens + m.cacheCreationInputTokens
    );
  }, 0);
}

/** Format token count as M/K abbreviated string */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

/** Format number with thousands separator */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
