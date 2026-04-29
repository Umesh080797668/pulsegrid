import { create } from 'zustand';
import { apiService } from '@/services/api';

export interface Flow {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'draft';
  triggerType: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlowRun {
  id: string;
  flowId: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  startedAt: string;
  completedAt?: string;
  stepsExecuted: number;
  totalSteps: number;
  errorMessage?: string;
}

interface FlowStore {
  flows: Flow[];
  recentRuns: FlowRun[];
  isLoading: boolean;
  error: string | null;
  fetchFlows: () => Promise<void>;
  fetchRecentRuns: (flowId: string) => Promise<void>;
  triggerFlow: (flowId: string, data?: Record<string, any>) => Promise<void>;
  clearError: () => void;
}

export const useFlowStore = create<FlowStore>((set) => ({
  flows: [],
  recentRuns: [],
  isLoading: false,
  error: null,

  fetchFlows: async () => {
    set({ isLoading: true, error: null });
    try {
      const flows = await apiService.getFlows();
      set({ flows, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch flows';
      set({ error: errorMessage, isLoading: false });
    }
  },

  fetchRecentRuns: async (flowId: string) => {
    set({ isLoading: true, error: null });
    try {
      const runs = await apiService.getFlowRuns(flowId);
      set({ recentRuns: runs, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch runs';
      set({ error: errorMessage, isLoading: false });
    }
  },

  triggerFlow: async (flowId: string, data?: Record<string, any>) => {
    set({ isLoading: true, error: null });
    try {
      await apiService.triggerFlow(flowId, data);
      set({ isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to trigger flow';
      set({ error: errorMessage, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
