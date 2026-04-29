import { create } from 'zustand';
import {
  fetchDigest,
  fetchFlows,
  fetchFlowStats,
  Flow,
  triggerFlow as triggerFlowApi,
} from './api';

interface FlowStore {
  flows: Flow[];
  isLoading: boolean;
  error: string | null;
  digestSummary: string;
  failedFlows: Array<{ id: string; name: string; failures: number }>;
  loadFlows: () => Promise<void>;
  loadDigest: () => Promise<void>;
  triggerFlow: (flowId: string) => Promise<boolean>;
  refreshStats: (flowId: string) => Promise<void>;
  setError: (error: string | null) => void;
}

export const useFlowStore = create<FlowStore>((set) => ({
  flows: [],
  isLoading: false,
  error: null,
  digestSummary: 'No digest available',
  failedFlows: [],

  loadFlows: async () => {
    set({ isLoading: true, error: null });
    try {
      const flows = await fetchFlows();
      set({ flows, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load flows',
        isLoading: false,
      });
    }
  },

  loadDigest: async () => {
    try {
      const digest = await fetchDigest();
      set({ digestSummary: digest.summary, failedFlows: digest.failedFlows });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load digest' });
    }
  },

  triggerFlow: async (flowId: string) => {
    try {
      await triggerFlowApi(flowId);
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to trigger flow' });
      return false;
    }
  },

  refreshStats: async (flowId: string) => {
    try {
      const stats = await fetchFlowStats(flowId);
      set((state) => ({
        flows: state.flows.map((flow) =>
          flow.id === flowId
            ? {
                ...flow,
                retryCount: stats.totalRuns,
              }
            : flow,
        ),
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to refresh stats' });
    }
  },

  setError: (error) => set({ error }),
}));
