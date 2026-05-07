<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  buildPulseApiUrl,
  buildPulseAuthHeaders,
  extractRuns,
  parsePulseResponse,
  pickLatestRunTimestamp,
  type PulseAnalyticsRunsResponse,
} from '../lib/pulse-api';

const props = defineProps<{
  workspaceId?: string;
  flowId?: string;
  apiKey?: string;
  apiBaseUrl?: string;
  theme?: string;
}>();

const status = ref('Ready');
const lastRun = ref('');
const errorMessage = ref('');
const isLoading = ref(false);

const statusClass = computed(() => status.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
const formattedLastRun = computed(() =>
  lastRun.value ? new Date(lastRun.value).toLocaleString() : '',
);

const refreshStatus = async () => {
  if (!props.workspaceId || !props.apiKey) {
    status.value = 'Unconfigured';
    lastRun.value = '';
    errorMessage.value = '';
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const query = new URLSearchParams({ workspaceId: props.workspaceId, limit: '1' });
    if (props.flowId) {
      query.set('flowId', props.flowId);
    }

    const response = await fetch(buildPulseApiUrl(`/analytics/runs?${query.toString()}`, props.apiBaseUrl), {
      method: 'GET',
      headers: {
        ...buildPulseAuthHeaders(props.apiKey),
      },
    });

    const payload = await parsePulseResponse<PulseAnalyticsRunsResponse>(response);
    const runs = extractRuns(payload);
    const latestRun = runs[0];

    if (latestRun) {
      const latestStatus = latestRun.status || 'idle';
      status.value = latestStatus.charAt(0).toUpperCase() + latestStatus.slice(1);
      lastRun.value = pickLatestRunTimestamp(latestRun);
      return;
    }

    status.value = 'Idle';
    lastRun.value = '';
  } catch (error) {
    status.value = 'Unavailable';
    lastRun.value = '';
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load status';
  } finally {
    isLoading.value = false;
  }
};

watch(
  () => [props.workspaceId, props.flowId, props.apiKey, props.apiBaseUrl],
  () => {
    void refreshStatus();
  },
  { immediate: true },
);
</script>

<template>
  <div :class="['pulse-status-container', theme]">
    <div class="status-indicator">
      <span class="dot" :class="statusClass"></span>
      <span class="status-text">{{ isLoading ? 'Refreshing…' : status }}</span>
    </div>
    <div class="last-run" v-if="formattedLastRun">
      Last run: {{ formattedLastRun }}
    </div>
    <div class="status-error" v-if="errorMessage">
      {{ errorMessage }}
    </div>
  </div>
</template>

<style>
.pulse-status-container {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-family: inherit;
  padding: 0.5rem;
  border-radius: 0.25rem;
  border: 1px solid #e2e8f0;
  background: white;
  color: #0f172a;
}
.pulse-status-container.dark {
  background: #0f172a;
  border-color: #334155;
  color: white;
}
.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #94a3b8;
}
.dot.idle { background-color: #34d399; }
.dot.success { background-color: #34d399; }
.dot.running { background-color: #3b82f6; }
.dot.failed { background-color: #ef4444; }
.dot.unconfigured { background-color: #f87171; }
.dot.unavailable { background-color: #f59e0b; }
.status-text {
  font-weight: 500;
  font-size: 0.875rem;
}
.last-run {
  font-size: 0.75rem;
  color: #64748b;
}
.status-error {
  font-size: 0.75rem;
  color: #b91c1c;
}
.dark .last-run {
  color: #94a3b8;
}
.dark .status-error {
  color: #fca5a5;
}
</style>
