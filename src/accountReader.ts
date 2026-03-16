import { execSync } from 'child_process';
import * as https from 'https';

export interface AccountInfo {
  fullName: string;
  email: string;
  plan: string;
  authMethod: string;
  organizationName: string;
}

export interface UsageLimit {
  utilization: number; // 0-100 percentage
  resets_at: string;   // ISO date string
}

export interface UsageInfo {
  five_hour: UsageLimit | null;
  seven_day: UsageLimit | null;
  seven_day_sonnet: UsageLimit | null;
}

interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms timestamp
  subscriptionType: string;
}

interface KeychainData {
  claudeAiOauth: OAuthCredentials;
  organizationUuid?: string;
}

function readKeychainMacOS(): KeychainData | null {
  const raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
    timeout: 3000,
  }).toString().trim();
  return JSON.parse(raw) as KeychainData;
}

function readKeychainWindows(): KeychainData | null {
  // Query Windows Credential Vault via PowerShell
  const script = [
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
    '$null = [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]',
    '$vault = New-Object Windows.Security.Credentials.PasswordVault',
    '$cred = $vault.FindAllByResource("Claude Code-credentials") | Select-Object -First 1',
    '$cred.RetrievePassword()',
    'Write-Output $cred.Password',
  ].join('; ');
  const raw = execSync(`powershell -NoProfile -Command "${script}"`, {
    timeout: 5000,
  }).toString().trim();
  return JSON.parse(raw) as KeychainData;
}

function readKeychainLinux(): KeychainData | null {
  // Try GNOME Keyring via secret-tool first
  try {
    const raw = execSync('secret-tool lookup service "Claude Code-credentials"', {
      timeout: 3000,
    }).toString().trim();
    if (raw) return JSON.parse(raw) as KeychainData;
  } catch {
    // secret-tool not available or credential not found — fall through
  }
  // Fallback: KWallet via kwallet-query (KDE)
  const raw = execSync(
    'kwallet-query -r "Claude Code-credentials" -f "Passwords" kdewallet',
    { timeout: 3000 }
  ).toString().trim();
  return JSON.parse(raw) as KeychainData;
}

function readKeychain(): KeychainData | null {
  try {
    switch (process.platform) {
      case 'darwin': return readKeychainMacOS();
      case 'win32':  return readKeychainWindows();
      case 'linux':  return readKeychainLinux();
      default:       return null;
    }
  } catch {
    return null;
  }
}

function httpsGet(url: string, headers: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Parse error: ${data.slice(0, 100)}`)); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(6000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function httpsPost(url: string, body: string, headers: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Parse error: ${data.slice(0, 100)}`)); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(6000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

/** Refresh access token using the stored refresh token */
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const body = JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken });
    const res = await httpsPost(
      'https://api.anthropic.com/v1/oauth/token',
      body,
      { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' }
    ) as Record<string, unknown>;
    return (res.access_token as string) ?? null;
  } catch {
    return null;
  }
}

async function getValidToken(): Promise<string | null> {
  const data = readKeychain();
  if (!data?.claudeAiOauth) return null;

  const { accessToken, refreshToken, expiresAt } = data.claudeAiOauth;

  // Refresh token 1 minute before expiry
  if (Date.now() < expiresAt - 60_000) return accessToken;

  return await refreshAccessToken(refreshToken);
}

function formatPlan(subscriptionType: string, orgType: string): string {
  if (orgType === 'claude_team') return 'Claude Team';
  if (subscriptionType === 'max') return 'Claude Max';
  if (subscriptionType === 'pro') return 'Claude Pro';
  return 'Claude Free';
}

export async function fetchAccountInfo(): Promise<AccountInfo | null> {
  try {
    const token = await getValidToken();
    if (!token) return null;

    const data = await httpsGet('https://api.anthropic.com/api/oauth/profile', {
      Authorization: `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
    }) as Record<string, Record<string, string>>;

    if (!data.account) return null;

    const keychain = readKeychain();
    const subscriptionType = keychain?.claudeAiOauth?.subscriptionType ?? 'free';

    return {
      fullName: data.account.full_name ?? '',
      email: data.account.email ?? '',
      plan: formatPlan(subscriptionType, data.organization?.organization_type ?? ''),
      authMethod: 'Claude AI',
      organizationName: data.organization?.name ?? '',
    };
  } catch {
    return null;
  }
}

export async function fetchUsageInfo(): Promise<UsageInfo | null> {
  try {
    const token = await getValidToken();
    if (!token) return null;

    const data = await httpsGet('https://api.anthropic.com/api/oauth/usage', {
      Authorization: `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    }) as Record<string, UsageLimit | null>;

    if (!data || (data as Record<string, unknown>).error) return null;

    return {
      five_hour: data.five_hour ?? null,
      seven_day: data.seven_day ?? null,
      seven_day_sonnet: data.seven_day_sonnet ?? null,
    };
  } catch {
    return null;
  }
}
