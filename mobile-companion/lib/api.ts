import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export type Flow = {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'draft';
  triggerType: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
};

export type FlowRun = {
  id: string;
  flowId: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  startedAt: string;
  completedAt?: string;
  stepsExecuted: number;
  totalSteps: number;
  errorMessage?: string;
};

export async function fetchFlows(): Promise<Flow[]> {
  const response = await api.get('/flows');
  return response.data.data ?? [];
}

export async function fetchFlowStats(flowId: string): Promise<{ successRate: number; totalRuns: number; lastRunAt?: string }> {
  const response = await api.get(`/flows/${flowId}/stats`);
  return response.data.data ?? { successRate: 0, totalRuns: 0 };
}

export async function triggerFlow(flowId: string, inputData: Record<string, unknown> = {}): Promise<void> {
  await api.post(`/flows/${flowId}/run`, { inputData });
}

export async function fetchDigest(): Promise<{ summary: string; failedFlows: Array<{ id: string; name: string; failures: number }> }> {
  const response = await api.get('/analytics/digest');
  return response.data.data ?? { summary: 'No digest available', failedFlows: [] };
}
