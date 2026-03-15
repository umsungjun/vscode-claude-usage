import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

import { ClaudeStatusBar } from './statusBar';
import { UsageWebviewPanel } from './webviewPanel';

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new ClaudeStatusBar();

  // Auto-refresh status bar and webview when stats-cache.json changes
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.Uri.file(path.join(os.homedir(), '.claude')),
      'stats-cache.json'
    )
  );
  watcher.onDidChange(() => {
    statusBar.refresh();
    UsageWebviewPanel.refresh();
  });

  const showCommand = vscode.commands.registerCommand('vscode-claude-usage.show', () =>
    UsageWebviewPanel.show(context)
  );

  context.subscriptions.push(statusBar, watcher, showCommand);
}

export function deactivate(): void {}
