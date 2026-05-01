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
