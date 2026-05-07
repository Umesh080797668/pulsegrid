export type PulseApiHeaders = Record<string, string>;

export interface PulseApiClientOptions {
  apiBaseUrl?: string;
  apiKey?: string;
}

export interface PulseTriggerRequest {
  workspaceId: string;
  flowId: string;
  payload?: Record<string, unknown>;
}

export interface PulseTriggerResponse {
  success?: boolean;
  run_id?: string;
  message?: string;
  [key: string]: unknown;
}

export interface PulseFlowSummary {
  id?: string;
  flow_id?: string;
  name?: string;
  flow_name?: string;
  title?: string;
  status?: string;
  enabled?: boolean;
  last_run_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface PulseFlowRunSummary {
  id?: string;
  flow_id?: string;
  started_at?: string | null;
  created_at?: string | null;
  finished_at?: string | null;
  status?: string;
  [key: string]: unknown;
}

export interface PulseAnalyticsRunsResponse {
  runs?: PulseFlowRunSummary[];
  statistics?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PulseWorkspaceHealthResponse {
  status?: string;
  totalRuns?: number;
  successRate?: number;
  activeConnectors?: number;
  recentErrorCount?: number;
  recentErrors?: unknown[];
  [key: string]: unknown;
}

const DEFAULT_API_BASE_URL = 'https://api.pulsegrid.io';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const resolvePulseApiBaseUrl = (override?: string): string => {
  const globalValue =
    typeof window !== 'undefined'
      ? (window as Window & { PULSEGRID_API_BASE_URL?: string }).PULSEGRID_API_BASE_URL
      : undefined;

  return trimTrailingSlash(override || globalValue || DEFAULT_API_BASE_URL);
};

export const buildPulseApiUrl = (path: string, apiBaseUrl?: string): string => {
  const base = resolvePulseApiBaseUrl(apiBaseUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

export const buildPulseAuthHeaders = (apiKey?: string): PulseApiHeaders => {
  if (!apiKey) {
    return {};
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    'X-API-Key': apiKey,
  };
};

export const parsePulseResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  let payload: T | string | Record<string, unknown> = {} as T;

  if (text) {
    try {
      payload = JSON.parse(text) as T;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'message' in payload
        ? String((payload as Record<string, unknown>).message)
        : typeof payload === 'string' && payload.trim().length > 0
          ? payload
          : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return payload as T;
};

export const extractFlows = (payload: unknown): PulseFlowSummary[] => {
  if (Array.isArray(payload)) {
    return payload as PulseFlowSummary[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const candidates = [record.flows, record.items, record.data, record.results];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as PulseFlowSummary[];
    }
  }

  return [];
};

export const extractRuns = (payload: unknown): PulseFlowRunSummary[] => {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const runs = record.runs;
  return Array.isArray(runs) ? (runs as PulseFlowRunSummary[]) : [];
};

export const pickLatestRunTimestamp = (
  run?: PulseFlowRunSummary,
): string =>
  run?.started_at || run?.created_at || run?.finished_at || '';
