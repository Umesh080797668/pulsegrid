export type OAuthConnectorKey =
  | 'gmail'
  | 'github'
  | 'google_sheets'
  | 'notion'
  | 'hubspot'
  | 'asana'
  | 'airtable'
  | 'jira'
  | 'linear'
  | 'shopify'
  | 'gitlab'
  | 'monday';

export type OAuthInstallConfig = {
  provider: string;
  authorizeUrl: string;
  clientId: string;
  scopes: string[];
  callbackUrl: string;
};

const providerDefaults: Record<OAuthConnectorKey, { provider: string; authorizeUrl: string; scopes: string[] }> = {
  gmail: {
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.send'],
  },
  google_sheets: {
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/spreadsheets'],
  },
  github: {
    provider: 'github',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    scopes: ['read:user', 'repo', 'workflow'],
  },
  notion: {
    provider: 'notion',
    authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
    scopes: ['read', 'update', 'insert'],
  },
  hubspot: {
    provider: 'hubspot',
    authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
    scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
  },
  asana: {
    provider: 'asana',
    authorizeUrl: 'https://app.asana.com/-/oauth_authorize',
    scopes: ['default'],
  },
  airtable: {
    provider: 'airtable',
    authorizeUrl: 'https://airtable.com/oauth2/v1/authorize',
    scopes: ['data.records:read', 'data.records:write'],
  },
  jira: {
    provider: 'atlassian',
    authorizeUrl: 'https://auth.atlassian.com/authorize',
    scopes: ['read:jira-user', 'write:jira-work'],
  },
  linear: {
    provider: 'linear',
    authorizeUrl: 'https://linear.app/oauth/authorize',
    scopes: ['read', 'write'],
  },
  shopify: {
    provider: 'shopify',
    authorizeUrl: 'https://{shop}.myshopify.com/admin/oauth/authorize',
    scopes: ['read_orders', 'write_products'],
  },
  gitlab: {
    provider: 'gitlab',
    authorizeUrl: 'https://gitlab.com/oauth/authorize',
    scopes: ['read_user', 'api'],
  },
  monday: {
    provider: 'monday',
    authorizeUrl: 'https://auth.monday.com/oauth2/authorize',
    scopes: ['boards:read', 'boards:write'],
  },
};

export function isOAuthConnector(connector: string): connector is OAuthConnectorKey {
  return connector in providerDefaults;
}

export function getOAuthInstallConfig(connector: string, workspaceId: string): OAuthInstallConfig | null {
  if (!isOAuthConnector(connector)) {
    return null;
  }

  const provider = providerDefaults[connector];
  const callbackUrl = `${window.location.origin}/oauth/callback?connector=${encodeURIComponent(connector)}&workspaceId=${encodeURIComponent(workspaceId)}`;
  const clientId = getClientIdForConnector(connector);

  return {
    provider: provider.provider,
    authorizeUrl: provider.authorizeUrl,
    clientId,
    scopes: provider.scopes,
    callbackUrl,
  };
}

export function buildOAuthAuthorizeUrl(config: OAuthInstallConfig): string {
  const url = new URL(config.authorizeUrl.replace('{shop}', 'example'));
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state: JSON.stringify({ provider: config.provider, connector: config.provider }),
  });

  if (config.provider === 'shopify') {
    params.set('shop', 'example');
  }

  url.search = params.toString();
  return url.toString();
}

export function getOAuthConnectionStorageKey(workspaceId: string): string {
  return `pulsegrid.oauth.${workspaceId}`;
}

export function readOAuthConnections(workspaceId: string): Record<string, { provider: string; connectedAt: string; source: string }> {
  try {
    return JSON.parse(localStorage.getItem(getOAuthConnectionStorageKey(workspaceId)) || '{}') as Record<string, { provider: string; connectedAt: string; source: string }>;
  } catch {
    return {};
  }
}

export function writeOAuthConnections(workspaceId: string, value: Record<string, { provider: string; connectedAt: string; source: string }>): void {
  localStorage.setItem(getOAuthConnectionStorageKey(workspaceId), JSON.stringify(value));
}

function getClientIdForConnector(connector: string): string {
  switch (connector) {
    case 'gmail':
    case 'google_sheets':
      return process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || '';
    case 'github':
      return process.env.NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || '';
    case 'notion':
      return process.env.NEXT_PUBLIC_NOTION_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || '';
    case 'hubspot':
      return process.env.NEXT_PUBLIC_HUBSPOT_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || '';
    case 'asana':
      return process.env.NEXT_PUBLIC_ASANA_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || '';
    case 'airtable':
      return process.env.NEXT_PUBLIC_AIRTABLE_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || '';
    case 'jira':
      return process.env.NEXT_PUBLIC_JIRA_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || '';
    case 'linear':
      return process.env.NEXT_PUBLIC_LINEAR_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || '';
    case 'shopify':
      return process.env.NEXT_PUBLIC_SHOPIFY_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || '';
    case 'gitlab':
      return process.env.NEXT_PUBLIC_GITLAB_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || '';
    case 'monday':
      return process.env.NEXT_PUBLIC_MONDAY_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || '';
    default:
      return process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || '';
  }
}
