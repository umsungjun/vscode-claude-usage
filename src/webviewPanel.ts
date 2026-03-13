import * as vscode from 'vscode';
import {
  DailyEntry,
  ModelUsage,
  Stats,
  formatNumber,
  formatTokens,
  readStats,
} from './statsReader';

export class UsageWebviewPanel {
  private static panel: vscode.WebviewPanel | undefined;

  static show(context: vscode.ExtensionContext): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'claude-usage-view',
      'Claude Usage',
      vscode.ViewColumn.One,
      { enableScripts: false, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.render();
  }

  static refresh(): void {
    if (this.panel) this.render();
  }

  private static render(): void {
    if (!this.panel) return;
    const stats = readStats();
    this.panel.webview.html = stats ? buildHtml(stats) : errorHtml();
  }
}

function buildHtml(stats: Stats): string {
  const models = Object.entries(stats.modelUsage ?? {}) as [string, ModelUsage][];

  // Build rows for the per-model cumulative table
  const modelRows = models
    .map(([model, u]) => {
      const total =
        u.inputTokens + u.outputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens;
      const shortModel = model.replace('claude-', '').replace(/-\d{8}$/, '');
      return `
        <tr>
          <td>${escHtml(shortModel)}</td>
          <td class="num">${formatNumber(u.inputTokens)}</td>
          <td class="num">${formatNumber(u.outputTokens)}</td>
          <td class="num">${formatNumber(u.cacheReadInputTokens)}</td>
          <td class="num">${formatNumber(u.cacheCreationInputTokens)}</td>
          <td class="num total">${formatTokens(total)}</td>
        </tr>`;
    })
    .join('');

  // Build rows for the last 14 days daily usage table
  const recent14 = [...(stats.dailyModelTokens ?? [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  const dailyRows = recent14
    .map((entry: DailyEntry) => {
      const total = Object.values(entry.tokensByModel).reduce((s, v) => s + v, 0);
      return `
        <tr>
          <td>${escHtml(entry.date)}</td>
          <td class="num total">${formatTokens(total)}</td>
        </tr>`;
    })
    .join('');

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
    padding: 20px 28px;
    max-width: 860px;
  }
  h1 { font-size: 1.4em; margin-bottom: 4px; }
  h2 { font-size: 1.1em; margin: 24px 0 8px; opacity: 0.75; text-transform: uppercase; letter-spacing: 0.05em; }
  .summary {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    margin: 16px 0;
  }
  .card {
    background: var(--vscode-editorWidget-background, #1e1e1e);
    border: 1px solid var(--vscode-editorWidget-border, #444);
    border-radius: 8px;
    padding: 12px 20px;
    min-width: 140px;
  }
  .card .label { font-size: 0.78em; opacity: 0.6; }
  .card .value { font-size: 1.6em; font-weight: bold; color: #E8943A; margin-top: 2px; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
  }
  th {
    text-align: left;
    padding: 6px 10px;
    font-size: 0.8em;
    opacity: 0.6;
    border-bottom: 1px solid var(--vscode-editorWidget-border, #444);
  }
  td {
    padding: 7px 10px;
    border-bottom: 1px solid var(--vscode-editorWidget-border, #2a2a2a);
  }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .total { font-weight: bold; color: #E8943A; }
  .footer { margin-top: 32px; opacity: 0.45; font-size: 0.8em; }
</style>
</head>
<body>
<h1>👁 Claude Usage</h1>

<div class="summary">
  <div class="card">
    <div class="label">Sessions</div>
    <div class="value">${formatNumber(stats.totalSessions)}</div>
  </div>
  <div class="card">
    <div class="label">Messages</div>
    <div class="value">${formatNumber(stats.totalMessages)}</div>
  </div>
</div>

<h2>By Model (cumulative)</h2>
<table>
  <thead>
    <tr>
      <th>Model</th>
      <th>Input</th>
      <th>Output</th>
      <th>Cache read</th>
      <th>Cache create</th>
      <th>Total</th>
    </tr>
  </thead>
  <tbody>${modelRows}</tbody>
</table>

<h2>Daily (last 14 days)</h2>
<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Tokens</th>
    </tr>
  </thead>
  <tbody>${dailyRows}</tbody>
</table>

<div class="footer">Source: ~/.claude/stats-cache.json · Refreshes automatically when file changes</div>
</body>
</html>`;
}

function errorHtml(): string {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px">
  <h2>Claude Usage View</h2>
  <p>Could not read <code>~/.claude/stats-cache.json</code>.</p>
  <p>Make sure Claude Code CLI has been used at least once.</p>
  </body></html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
