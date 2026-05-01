export const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3000';

export async function authenticatedFetch(
  input: string,
  token: string,
  setToken: (token: string) => void,
  init: RequestInit = {},
) {
  const first = await fetch(input, {
    ...init,
    credentials: 'include',
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });

  if (first.status !== 401) {
    return first;
  }

  const refresh = await fetch(`${apiBase}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!refresh.ok) {
    return first;
  }

  const data = (await refresh.json()) as { accessToken: string };
  setToken(data.accessToken);

  return fetch(input, {
    ...init,
    credentials: 'include',
    headers: { ...(init.headers || {}), Authorization: `Bearer ${data.accessToken}` },
  });
}

export type WorkspaceSubscriptionStatus = {
  workspace?: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
  billing?: {
    requested_plan?: string;
    confirmed_plan?: string;
    status?: string;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    updated_at?: string | null;
  };
};

export async function upgradeWorkspacePlan(params: {
  workspaceId: string;
  plan: string;
  token: string;
  setToken: (token: string) => void;
}) {
  return authenticatedFetch(
    `${apiBase}/workspaces/${params.workspaceId}/upgrade`,
    params.token,
    params.setToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: params.plan }),
    },
  );
}

export async function getWorkspaceSubscriptionStatus(params: {
  workspaceId: string;
  token: string;
  setToken: (token: string) => void;
}): Promise<WorkspaceSubscriptionStatus | null> {
  const response = await authenticatedFetch(
    `${apiBase}/workspaces/${params.workspaceId}/billing/subscription`,
    params.token,
    params.setToken,
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as WorkspaceSubscriptionStatus;
}

export type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  created_at?: string;
  last_used_at?: string | null;
  expires_at?: string | null;
  scopes: string[];
};

export type CreateApiKeyResponse = {
  id: string;
  name: string;
  key_prefix: string;
  key: string; // Full key - only returned on creation
  created_at: string;
};

export async function createApiKey(params: {
  workspaceId: string;
  name: string;
  description?: string;
  token: string;
  setToken: (token: string) => void;
}): Promise<CreateApiKeyResponse | null> {
  const response = await authenticatedFetch(
    `${apiBase}/workspaces/${params.workspaceId}/api-keys`,
    params.token,
    params.setToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.name,
        description: params.description,
      }),
    },
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as CreateApiKeyResponse;
}

export async function listApiKeys(params: {
  workspaceId: string;
  token: string;
  setToken: (token: string) => void;
}): Promise<ApiKey[] | null> {
  const response = await authenticatedFetch(
    `${apiBase}/workspaces/${params.workspaceId}/api-keys`,
    params.token,
    params.setToken,
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as ApiKey[];
}

export async function revokeApiKey(params: {
  workspaceId: string;
  keyId: string;
  token: string;
  setToken: (token: string) => void;
}): Promise<boolean> {
  const response = await authenticatedFetch(
    `${apiBase}/workspaces/${params.workspaceId}/api-keys/${params.keyId}`,
    params.token,
    params.setToken,
    { method: 'DELETE' },
  );

  return response.ok;
}

export type DependentFlow = {
  flow_id: string;
  flow_name: string;
  status: string;
  created_at?: string;
  last_executed_at?: string | null;
  execution_count: number;
};

export type CredentialDependentsResponse = {
  credential_id: string;
  connector_id: string;
  total_flows: number;
  active_flows: number;
  flows: DependentFlow[];
};

export async function getCredentialDependents(params: {
  credentialId: string;
  token: string;
  setToken: (token: string) => void;
}): Promise<CredentialDependentsResponse | null> {
  const response = await authenticatedFetch(
    `${apiBase}/credentials/${params.credentialId}/dependents`,
    params.token,
    params.setToken,
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as CredentialDependentsResponse;
}
