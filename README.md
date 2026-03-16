# VSCode Claude Usage

A VS Code extension that displays your [Claude Code](https://claude.ai/code) account info and token usage directly in the Activity Bar.

[한국어 README](README.ko.md)

---

## Features

- **Account info** — Auth method, email, and plan fetched live from the Claude API
- **Usage progress bars** — Session (5hr) and Weekly (7 day) utilization with reset times, identical to the `/usage` command in Claude Code
- **Token stats** — Today's tokens, this week's tokens, all-time sessions and messages
- **Daily breakdown** — Token usage for the last 14 days
- **Per-model cumulative stats** — Input, output, and total tokens by model
- **Auto-refresh** — Data reloads every 5 minutes and whenever the sidebar becomes visible

## Requirements

- [Claude Code CLI](https://claude.ai/code) installed and logged in
- VS Code 1.85 or later
- Platform support:
  - **macOS** — credentials read from macOS Keychain
  - **Windows** — credentials read from Windows Credential Vault
  - **Linux** — credentials read from GNOME Keyring (`secret-tool`) or KWallet (`kwallet-query`)

## Usage

Click the **sparkle icon (✳)** in the Activity Bar to open the usage panel.

To refresh local stats (Daily / By Model data), run `/stats` inside a Claude Code session. The extension will automatically pick up the updated file.

> **Why is Daily data outdated?**
> Stats, Daily, and By Model data come from `~/.claude/stats-cache.json`, which is maintained by the Claude Code CLI. Running `/stats` in Claude Code forces a recalculation.

## How It Works

The extension reads OAuth credentials stored by Claude Code in the macOS Keychain (`Claude Code-credentials`) and calls two Anthropic API endpoints:

| Endpoint | Data |
|---|---|
| `GET /api/oauth/profile` | Account name, email, plan |
| `GET /api/oauth/usage` | Session & weekly utilization % (plan-aware, server-computed) |

Local stats are read from `~/.claude/stats-cache.json` and re-loaded whenever that file changes.

## Development

```bash
pnpm install
pnpm run watch   # incremental build
```

Press **F5** in VS Code to launch the Extension Development Host.

```bash
pnpm run package   # build + produce .vsix
```

## License

MIT
