import { AccountInfo, UsageInfo, fetchAccountInfo, fetchUsageInfo } from './accountReader';

export type FetchState = 'loading' | 'ok' | 'error';

export interface CachedData {
  account: AccountInfo | null;
  usage: UsageInfo | null;
  state: FetchState;
  error: string | null;
  lastFetched: Date | null;
}

const cache: CachedData = {
  account: null,
  usage: null,
  state: 'loading',
  error: null,
  lastFetched: null,
};

const listeners: Array<(data: CachedData) => void> = [];

export function getCachedData(): CachedData {
  return { ...cache };
}

export function onDataUpdate(listener: (data: CachedData) => void): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function notify(): void {
  const snapshot = { ...cache };
  listeners.forEach((l) => l(snapshot));
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.message.includes('timeout')) return 'Network request timed out';
    if (e.message.includes('401') || e.message.includes('auth')) return 'Authentication expired. Please restart Claude Code';
    if (e.message.includes('429')) return 'Rate limit exceeded. Please try again later';
    if (e.message.includes('No OAuth')) return 'Please log in to Claude Code';
    return e.message;
  }
  return 'An unknown error occurred';
}

export async function refreshData(): Promise<void> {
  cache.state = 'loading';
  try {
    const [account, usage] = await Promise.all([fetchAccountInfo(), fetchUsageInfo()]);

    if (!account && !usage) {
      cache.state = 'error';
      cache.error = 'Claude Code credentials not found. Please log in and try again';
    } else {
      cache.account = account;
      cache.usage = usage;
      cache.state = 'ok';
      cache.error = null;
      cache.lastFetched = new Date();
    }
  } catch (e) {
    cache.state = 'error';
    cache.error = errorMessage(e);
  }
  notify();
}

// Auto-refresh every 5 minutes
let timer: ReturnType<typeof setInterval> | null = null;

export function startAutoRefresh(): void {
  refreshData();
  timer = setInterval(() => refreshData(), 5 * 60 * 1000);
}

export function stopAutoRefresh(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
