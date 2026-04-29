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
