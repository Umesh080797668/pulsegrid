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

export type FlowVersion = {
  id: string;
  flow_id: string;
  definition: Record<string, unknown>;
  created_at: string;
  created_by?: string | null;
  note?: string | null;
};

export type FlowVersionDiff = {
  added_nodes: string[];
  removed_nodes: string[];
  changed_nodes: string[];
};

export type FlowEnvironmentStatus = {
  environment: 'staging' | 'production' | string;
  deployed: boolean;
  enabled: boolean;
  deployed_at?: string | null;
  deployed_by?: string | null;
};

export async function listFlowVersions(params: {
  flowId: string;
  token: string;
  setToken: (token: string) => void;
}): Promise<FlowVersion[]> {
  const response = await authenticatedFetch(
    `${apiBase}/flows/${params.flowId}/versions`,
    params.token,
    params.setToken,
  );
  if (!response.ok) {
    throw new Error(`Failed to load flow versions (${response.status})`);
  }
  return (await response.json()) as FlowVersion[];
}

export async function getFlowVersionDiff(params: {
  flowId: string;
  versionId: string;
  targetVersionId?: string;
  token: string;
  setToken: (token: string) => void;
}): Promise<FlowVersionDiff> {
  const qp = new URLSearchParams();
  if (params.targetVersionId) qp.set('targetVersionId', params.targetVersionId);
  const suffix = qp.toString() ? `?${qp.toString()}` : '';
  const response = await authenticatedFetch(
    `${apiBase}/flows/${params.flowId}/versions/${params.versionId}/diff${suffix}`,
    params.token,
    params.setToken,
  );
  if (!response.ok) {
    throw new Error(`Failed to load flow diff (${response.status})`);
  }
  return (await response.json()) as FlowVersionDiff;
}

export async function rollbackFlowVersion(params: {
  flowId: string;
  versionId: string;
  note?: string;
  token: string;
  setToken: (token: string) => void;
}): Promise<Record<string, unknown>> {
  const response = await authenticatedFetch(
    `${apiBase}/flows/${params.flowId}/rollback/${params.versionId}`,
    params.token,
    params.setToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: params.note }),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to rollback flow version (${response.status})`);
  }
  return (await response.json()) as Record<string, unknown>;
}

export async function getFlowEnvironments(params: {
  flowId: string;
  token: string;
  setToken: (token: string) => void;
}): Promise<FlowEnvironmentStatus[]> {
  const response = await authenticatedFetch(
    `${apiBase}/flows/${params.flowId}/environments`,
    params.token,
    params.setToken,
  );
  if (!response.ok) {
    throw new Error(`Failed to load flow environments (${response.status})`);
  }
  return (await response.json()) as FlowEnvironmentStatus[];
}

export async function deployFlowToStaging(params: {
  flowId: string;
  note?: string;
  token: string;
  setToken: (token: string) => void;
}): Promise<FlowEnvironmentStatus[]> {
  const response = await authenticatedFetch(
    `${apiBase}/flows/${params.flowId}/deploy/staging`,
    params.token,
    params.setToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: params.note }),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to deploy flow to staging (${response.status})`);
  }
  return (await response.json()) as FlowEnvironmentStatus[];
}

export async function promoteFlowToProduction(params: {
  flowId: string;
  note?: string;
  token: string;
  setToken: (token: string) => void;
}): Promise<Record<string, unknown>> {
  const response = await authenticatedFetch(
    `${apiBase}/flows/${params.flowId}/promote`,
    params.token,
    params.setToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: params.note }),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to promote flow to production (${response.status})`);
  }
  return (await response.json()) as Record<string, unknown>;
}

export async function runFlowInEnvironment(params: {
  flowId: string;
  environment: 'staging' | 'production' | string;
  input?: Record<string, unknown>;
  token: string;
  setToken: (token: string) => void;
}): Promise<Record<string, unknown>> {
  const response = await authenticatedFetch(
    `${apiBase}/flows/${params.flowId}/run/${encodeURIComponent(params.environment)}`,
    params.token,
    params.setToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: params.input || {} }),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to run flow in ${params.environment} (${response.status})`);
  }
  return (await response.json()) as Record<string, unknown>;
}

export async function getFlowRunsForEnvironment(params: {
  flowId: string;
  environment: 'staging' | 'production' | string;
  token: string;
  setToken: (token: string) => void;
}) {
  const response = await authenticatedFetch(
    `${apiBase}/flows/${params.flowId}/runs?environment=${encodeURIComponent(params.environment)}`,
    params.token,
    params.setToken,
  );
  if (!response.ok) {
    throw new Error(`Failed to load ${params.environment} flow runs (${response.status})`);
  }
  return (await response.json()) as { runs: Array<Record<string, unknown>>; total: number; limit: number; offset: number; environment: string };
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
