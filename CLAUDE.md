# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm run compile      # one-shot build → dist/extension.js
pnpm run watch        # incremental build (use while F5 debugging in VS Code)
pnpm run package      # compile + vsce package (produces .vsix)
pnpm run format       # prettier format
```

Press **F5** in VS Code to launch the Extension Development Host with the compiled extension.

## Architecture

The extension has two rendering surfaces that share the same data layer:

- **`UsageSidebarProvider`** (`webviewPanel.ts`) — `WebviewViewProvider` registered for the Activity Bar view (`claude-usage.usageView`). Refreshes API data on every visibility change.
- **`UsageWebviewPanel`** (`webviewPanel.ts`) — a traditional `WebviewPanel` opened via the `vscode-claude-usage.show` command. Both surfaces call the same `buildHtml()` function.

### Data layer

| Module | Responsibility |
|---|---|
| `accountReader.ts` | Reads OAuth credentials from macOS Keychain (`Claude Code-credentials`), calls `api.anthropic.com/api/oauth/profile` and `/api/oauth/usage`. Handles token refresh via `/v1/oauth/token`. |
| `dataCache.ts` | In-memory singleton cache (`CachedData`). Exposes `refreshData()`, `getCachedData()`, and `onDataUpdate()` pub/sub. Auto-refreshes every 5 minutes via `startAutoRefresh()`. |
| `statsReader.ts` | Reads `~/.claude/stats-cache.json` synchronously. This file is managed by the Claude Code CLI — users must run `/stats` inside Claude Code to update it. |

### Data flow

```
extension activate
  └─ startAutoRefresh()          ← initial fetch + 5-min interval
       └─ refreshData()
            ├─ fetchAccountInfo() → GET /api/oauth/profile
            └─ fetchUsageInfo()  → GET /api/oauth/usage
                                    (five_hour / seven_day / seven_day_sonnet utilization %)

onDataUpdate listeners → re-render sidebar + panel
stats-cache.json watcher → re-render sidebar + panel (local stats only)
```

### API notes

- OAuth token is stored in macOS Keychain under service name `"Claude Code-credentials"`, key `claudeAiOauth`.
- `/api/oauth/usage` returns server-computed utilization percentages — plan limits are not stored locally.
- `/api/oauth/usage` can return HTTP 429; the extension surfaces the error message directly.
- `stats-cache.json` fields used: `dailyModelTokens`, `modelUsage`, `totalSessions`, `totalMessages`.

## Package manager

This project uses **pnpm**. Do not use `npm` or `yarn`.
