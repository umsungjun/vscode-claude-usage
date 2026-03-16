import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

import { startAutoRefresh } from './dataCache';
import { UsageSidebarProvider, UsageWebviewPanel } from './webviewPanel';

export function activate(context: vscode.ExtensionContext): void {
  startAutoRefresh();

  const sidebarProvider = new UsageSidebarProvider();

  // Re-render when stats-cache.json changes
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.Uri.file(path.join(os.homedir(), '.claude')),
      'stats-cache.json'
    )
  );
  watcher.onDidChange(() => {
    sidebarProvider.refresh();
    UsageWebviewPanel.refresh();
  });

  const showCommand = vscode.commands.registerCommand('vscode-claude-usage.show', () =>
    UsageWebviewPanel.show(context)
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(UsageSidebarProvider.viewId, sidebarProvider),
    watcher,
    showCommand
  );
}

export function deactivate(): void {}
