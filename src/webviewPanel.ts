import * as vscode from 'vscode';
import { AccountInfo, UsageInfo } from './accountReader';
import { getCachedData, onDataUpdate, refreshData } from './dataCache';
import {
  DailyEntry,
  ModelUsage,
  Stats,
  formatNumber,
  formatTokens,
  getTodayTokens,
  readStats,
} from './statsReader';

/** Sidebar view provider — rendered when the Activity Bar icon is clicked */
export class UsageSidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'claude-usage.usageView';
  private view?: vscode.WebviewView;
  private unsubscribe?: () => void;

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: false };

    this.unsubscribe = onDataUpdate(() => this.render());

    // Refresh API data every time the view becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) refreshData();
    });

    webviewView.onDidDispose(() => {
      this.unsubscribe?.();
      this.view = undefined;
    });

    refreshData();
    this.render();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    if (!this.view) return;
    const stats = readStats();
    const cached = getCachedData();
    this.view.webview.html = stats ? buildHtml(stats, cached) : errorHtml();
  }
}

export class UsageWebviewPanel {
  private static panel: vscode.WebviewPanel | undefined;
  private static unsubscribe: (() => void) | null = null;

  static show(_context: vscode.ExtensionContext): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'vscode-claude-usage',
      'Claude Usage',
      vscode.ViewColumn.One,
      { enableScripts: false, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.unsubscribe?.();
      this.unsubscribe = null;
    });

    this.unsubscribe = onDataUpdate(() => this.render());
    this.render();
  }

  static refresh(): void {
    if (this.panel) this.render();
  }

  private static render(): void {
    if (!this.panel) return;
    const stats = readStats();
    const cached = getCachedData();
    this.panel.webview.html = stats ? buildHtml(stats, cached) : errorHtml();
  }
}

function buildHtml(stats: Stats, cached: { account: AccountInfo | null; usage: UsageInfo | null; state: string; error: string | null }): string {
  const { account, usage } = cached;
  const todayTokens = getTodayTokens(stats);

  // Sum tokens for the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const weeklyTokens = (stats.dailyModelTokens ?? [])
    .filter((d) => d.date >= sevenDaysAgo.toISOString().split('T')[0])
    .reduce((sum, d) => sum + Object.values(d.tokensByModel).reduce((s, v) => s + v, 0), 0);

  // Daily usage for the last 14 days
  const recent14 = [...(stats.dailyModelTokens ?? [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  const dailyRows = recent14
    .map((entry: DailyEntry) => {
      const total = Object.values(entry.tokensByModel).reduce((s, v) => s + v, 0);
      return `<tr><td>${escHtml(entry.date)}</td><td class="num total">${formatTokens(total)}</td></tr>`;
    })
    .join('');

  // Cumulative usage per model
  const models = Object.entries(stats.modelUsage ?? {}) as [string, ModelUsage][];
  const modelRows = models
    .map(([model, u]) => {
      const total = u.inputTokens + u.outputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens;
      const shortModel = model.replace('claude-', '').replace(/-\d{8}$/, '');
      return `<tr>
        <td>${escHtml(shortModel)}</td>
        <td class="num">${formatNumber(u.inputTokens)}</td>
        <td class="num">${formatNumber(u.outputTokens)}</td>
        <td class="num total">${formatTokens(total)}</td>
      </tr>`;
    })
    .join('');

  // Account info rows
  const accountRows = cached.state === 'loading'
    ? `<tr><td colspan="2" class="muted">Loading…</td></tr>`
    : cached.state === 'error'
    ? `<tr><td colspan="2" class="error-row">⚠ ${escHtml(cached.error ?? 'An error occurred')}</td></tr>`
    : account
    ? `
      <tr><td class="key">Auth method</td><td>${escHtml(account.authMethod)}</td></tr>
      <tr><td class="key">Email</td><td>${escHtml(account.email)}</td></tr>
      <tr><td class="key">Plan</td><td>${escHtml(account.plan)}</td></tr>
    `
    : `<tr><td colspan="2" class="muted">Unable to load account info</td></tr>`;

  // Build usage progress bar HTML
  function usageBar(title: string, limit: { utilization: number; resets_at: string } | null): string {
    if (!limit) return '';
    const pct = Math.floor(limit.utilization);
    const resetsAt = new Date(limit.resets_at);
    const diffMs = resetsAt.getTime() - Date.now();
    const diffH = Math.floor(diffMs / 3_600_000);
    const diffD = Math.floor(diffMs / 86_400_000);
    const resetStr = diffD >= 1 ? `Resets in ${diffD}d` : diffH >= 1 ? `Resets in ${diffH}h` : 'Resetting soon';
    return `
      <div class="usage-row">
        <div class="usage-header">
          <span class="usage-title">${escHtml(title)}</span>
          <span class="usage-pct">${pct}%</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="usage-reset">${resetStr}</div>
      </div>`;
  }

  const usageBars = cached.state === 'loading'
    ? `<div class="muted-text">Loading…</div>`
    : cached.state === 'error'
    ? `<div class="error-text">⚠ ${escHtml(cached.error ?? 'Unable to load usage data')}</div>`
    : usage
    ? [
        usageBar('Session (5hr)', usage.five_hour),
        usageBar('Weekly (7 day)', usage.seven_day),
        usageBar('Weekly Sonnet', usage.seven_day_sonnet),
      ].filter(Boolean).join('')
    : `<div class="muted-text">Unable to load usage data</div>`;

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Claude Usage</title>
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 24px 32px;
    max-width: 720px;
  }
  h1 { font-size: 1.3em; margin: 0 0 24px; }
  h2 {
    font-size: 0.75em;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.5;
    margin: 28px 0 10px;
  }

  /* Account / usage card */
  .section {
    background: var(--vscode-editorWidget-background, #1e1e1e);
    border: 1px solid var(--vscode-editorWidget-border, #3a3a3a);
    border-radius: 8px;
    overflow: hidden;
  }
  .section table { width: 100%; border-collapse: collapse; }
  .section td {
    padding: 10px 16px;
    border-bottom: 1px solid var(--vscode-editorWidget-border, #2e2e2e);
  }
  .section tr:last-child td { border-bottom: none; }
  .section td.key { opacity: 0.55; width: 140px; }
  .section td.muted { opacity: 0.4; font-style: italic; }

  /* Usage progress bars */
  .usage-row { padding: 12px 16px; border-bottom: 1px solid var(--vscode-editorWidget-border, #2e2e2e); }
  .usage-row:last-child { border-bottom: none; }
  .usage-header { display: flex; justify-content: space-between; margin-bottom: 6px; font-weight: 600; }
  .usage-pct { color: #E8692A; }
  .progress-track { height: 6px; background: var(--vscode-editorWidget-border, #3a3a3a); border-radius: 3px; overflow: hidden; }
  .progress-fill { height: 100%; background: #4a9eff; border-radius: 3px; transition: width 0.3s; }
  .usage-reset { font-size: 0.78em; opacity: 0.45; margin-top: 5px; }
  .muted-text { padding: 12px 16px; opacity: 0.4; font-style: italic; }
  .error-row, .error-text { padding: 12px 16px; color: #f48771; font-size: 0.88em; }

  /* Token stat cards */
  .metrics {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .metric {
    background: var(--vscode-editorWidget-background, #1e1e1e);
    border: 1px solid var(--vscode-editorWidget-border, #3a3a3a);
    border-radius: 8px;
    padding: 14px 20px;
    flex: 1;
    min-width: 140px;
  }
  .metric .label { font-size: 0.78em; opacity: 0.5; margin-bottom: 6px; }
  .metric .value { font-size: 1.6em; font-weight: bold; color: #E8692A; }
  .metric .sub { font-size: 0.75em; opacity: 0.45; margin-top: 4px; }

  /* Data tables */
  table.data {
    width: 100%;
    border-collapse: collapse;
    margin-top: 4px;
  }
  table.data th {
    text-align: left;
    padding: 6px 10px;
    font-size: 0.78em;
    opacity: 0.5;
    border-bottom: 1px solid var(--vscode-editorWidget-border, #3a3a3a);
  }
  table.data td {
    padding: 7px 10px;
    border-bottom: 1px solid var(--vscode-editorWidget-border, #252525);
  }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .total { color: #E8692A; font-weight: 600; }
  .footer { margin-top: 32px; opacity: 0.45; font-size: 0.78em; line-height: 1.6; }
  .footer code { opacity: 0.9; background: var(--vscode-textCodeBlock-background, #2a2a2a); padding: 1px 5px; border-radius: 3px; }
  .notice {
    background: var(--vscode-inputValidation-infoBackground, #1a3a4a);
    border: 1px solid var(--vscode-inputValidation-infoBorder, #3794ff);
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 0.88em;
    margin-top: 20px;
    margin-bottom: 4px;
  }
  .notice code { background: var(--vscode-textCodeBlock-background, #2a2a2a); padding: 1px 5px; border-radius: 3px; font-size: 0.95em; }
</style>
</head>
<body>
<h1>Account &amp; Usage</h1>

<h2>Account</h2>
<div class="section">
  <table>${accountRows}</table>
</div>

<h2>Usage</h2>
<div class="section">${usageBars}</div>

<div class="notice">
  💡 If Stats, Daily, or By Model data appears outdated, run <code>/stats</code> in the Claude Code terminal to fetch the latest data.
</div>

<h2>Stats</h2>
<div class="metrics">
  <div class="metric">
    <div class="label">Today</div>
    <div class="value">${formatTokens(todayTokens)}</div>
    <div class="sub">tokens</div>
  </div>
  <div class="metric">
    <div class="label">This week</div>
    <div class="value">${formatTokens(weeklyTokens)}</div>
    <div class="sub">tokens</div>
  </div>
  <div class="metric">
    <div class="label">Sessions</div>
    <div class="value">${formatNumber(stats.totalSessions)}</div>
    <div class="sub">all time</div>
  </div>
  <div class="metric">
    <div class="label">Messages</div>
    <div class="value">${formatNumber(stats.totalMessages)}</div>
    <div class="sub">all time</div>
  </div>
</div>

<h2>Daily (last 14 days)</h2>
<table class="data">
  <thead><tr><th>Date</th><th>Tokens</th></tr></thead>
  <tbody>${dailyRows}</tbody>
</table>

<h2>By Model (cumulative)</h2>
<table class="data">
  <thead>
    <tr><th>Model</th><th>Input</th><th>Output</th><th>Total</th></tr>
  </thead>
  <tbody>${modelRows}</tbody>
</table>

<div class="footer">Source: ~/.claude/stats-cache.json</div>
</body>
</html>`;
}

function errorHtml(): string {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px">
  <h2>Claude Usage</h2>
  <p>Could not read <code>~/.claude/stats-cache.json</code>.</p>
  <p>Make sure Claude Code CLI has been used at least once.</p>
  </body></html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
