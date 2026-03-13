import * as vscode from 'vscode';
import {
  ModelUsage,
  Stats,
  formatNumber,
  formatTokens,
  getTodayTokens,
  readStats,
} from './statsReader';

export class ClaudeStatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'claude-usage-view.show';
    this.refresh();
    this.item.show();
  }

  refresh(): void {
    const stats = readStats();
    if (!stats) {
      this.item.text = '$(eye) Claude: N/A';
      this.item.tooltip = 'stats-cache.json not found (~/.claude/)';
      return;
    }

    const todayTokens = getTodayTokens(stats);
    this.item.text = `$(eye) ${formatTokens(todayTokens)}`;
    this.item.tooltip = buildTooltip(stats, todayTokens);
  }

  dispose(): void {
    this.item.dispose();
  }
}

function buildTooltip(stats: Stats, todayTokens: number): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.supportThemeIcons = true;

  md.appendMarkdown('### $(eye) Claude Usage Today\n\n');
  md.appendMarkdown('---\n\n');

  // Per-model breakdown for today
  const today = new Date().toISOString().split('T')[0];
  const todayEntry = stats.dailyModelTokens?.find((d) => d.date === today);

  if (todayEntry) {
    for (const [model, tokens] of Object.entries(todayEntry.tokensByModel)) {
      const shortModel = model.replace('claude-', '').replace(/-\d{8}$/, '');
      md.appendMarkdown(`**${shortModel}**: ${formatTokens(tokens)}\n\n`);
    }
    md.appendMarkdown('---\n\n');
  }

  // Cumulative input/output tokens across all models
  const allModels = Object.values(stats.modelUsage ?? {}) as ModelUsage[];
  const totalInput = allModels.reduce((s, m) => s + m.inputTokens, 0);
  const totalOutput = allModels.reduce((s, m) => s + m.outputTokens, 0);
  const totalCacheRead = allModels.reduce((s, m) => s + m.cacheReadInputTokens, 0);
  const totalCacheCreate = allModels.reduce((s, m) => s + m.cacheCreationInputTokens, 0);

  md.appendMarkdown(`**Today total**: ${formatTokens(todayTokens)} tokens\n\n`);
  md.appendMarkdown('---\n\n');
  md.appendMarkdown('**Cumulative (all time)**\n\n');
  md.appendMarkdown(`Input: \`${formatNumber(totalInput)}\`  \n`);
  md.appendMarkdown(`Output: \`${formatNumber(totalOutput)}\`  \n`);
  md.appendMarkdown(`Cache read: \`${formatNumber(totalCacheRead)}\`  \n`);
  md.appendMarkdown(`Cache create: \`${formatNumber(totalCacheCreate)}\`  \n\n`);
  md.appendMarkdown(
    `Sessions: **${stats.totalSessions}** | Messages: **${stats.totalMessages}**\n\n`
  );
  md.appendMarkdown('---\n\n');
  md.appendMarkdown('_Click to open full usage panel_');

  return md;
}
