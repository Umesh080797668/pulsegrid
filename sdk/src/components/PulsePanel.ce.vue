<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  buildPulseApiUrl,
  buildPulseAuthHeaders,
  extractFlows,
  parsePulseResponse,
  type PulseFlowSummary,
} from '../lib/pulse-api';

const props = defineProps<{
  workspaceId?: string;
  apiKey?: string;
  apiBaseUrl?: string;
  theme?: string;
}>();

const flows = ref<PulseFlowSummary[]>([]);
const isLoading = ref(false);
const errorMessage = ref('');

const normalizedFlows = computed(() =>
  flows.value.map((flow, index) => ({
    id: flow.id || flow.flow_id || flow.name || flow.flow_name || flow.title || `flow-${index}`,
    name: flow.name || flow.flow_name || flow.title || flow.id || 'Untitled Flow',
    status: String(flow.status || (flow.enabled === false ? 'inactive' : 'active')).toLowerCase(),
  })),
);

const loadFlows = async () => {
  if (!props.workspaceId || !props.apiKey) {
    flows.value = [];
    errorMessage.value = '';
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const response = await fetch(
      buildPulseApiUrl(`/flows?workspaceId=${encodeURIComponent(props.workspaceId)}`, props.apiBaseUrl),
      {
        method: 'GET',
        headers: {
          ...buildPulseAuthHeaders(props.apiKey),
        },
      },
    );

    const payload = await parsePulseResponse<unknown>(response);
    flows.value = extractFlows(payload);
  } catch (error) {
    flows.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load flows';
  } finally {
    isLoading.value = false;
  }
};

watch(
  () => [props.workspaceId, props.apiKey, props.apiBaseUrl],
  () => {
    void loadFlows();
  },
  { immediate: true },
);
</script>

<template>
  <div :class="['pulse-panel', theme]">
    <div class="panel-header">
      <h2>Flow Management</h2>
      <span class="workspace-badge" v-if="workspaceId">{{ workspaceId }}</span>
    </div>
    
    <div class="panel-content" v-if="workspaceId && apiKey">
      <div class="panel-loading" v-if="isLoading">
        Loading flows…
      </div>
      <div class="panel-error" v-if="errorMessage">
        {{ errorMessage }}
      </div>
      <div class="panel-empty-state" v-if="!isLoading && !errorMessage && normalizedFlows.length === 0">
        No flows found for this workspace.
      </div>
      <ul class="flow-list">
        <li v-for="flow in normalizedFlows" :key="String(flow.id)" class="flow-item">
          <span class="flow-name">{{ flow.name }}</span>
          <span :class="['flow-status', flow.status]">{{ flow.status }}</span>
        </li>
      </ul>
    </div>
    <div class="panel-empty" v-else>
      <p>Please configure workspace-id and api-key parameters to view flows.</p>
    </div>
  </div>
</template>

<style>
.pulse-panel {
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  overflow: hidden;
  font-family: inherit;
  background: white;
  color: #0f172a;
}
.pulse-panel.dark {
  border-color: #334155;
  background: #0f172a;
  color: white;
}
.panel-header {
  padding: 1rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pulse-panel.dark .panel-header {
  border-color: #334155;
}
.panel-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}
.workspace-badge {
  background: #f1f5f9;
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  color: #475569;
}
.dark .workspace-badge {
  background: #1e293b;
  color: #cbd5e1;
}
.panel-content, .panel-empty {
  padding: 1rem;
}
.panel-loading,
.panel-error {
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
}
.panel-empty-state {
  font-size: 0.875rem;
  color: #64748b;
  margin-bottom: 0.75rem;
}
.panel-loading {
  color: #475569;
}
.panel-error {
  color: #b91c1c;
}
.dark .panel-loading {
  color: #cbd5e1;
}
.dark .panel-empty-state {
  color: #94a3b8;
}
.dark .panel-error {
  color: #fca5a5;
}
.panel-empty p {
  margin: 0;
  color: #64748b;
  text-align: center;
}
.dark .panel-empty p {
  color: #94a3b8;
}
.flow-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.flow-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: #f8fafc;
  border-radius: 0.25rem;
  border: 1px solid #f1f5f9;
}
.dark .flow-item {
  background: #1e293b;
  border-color: #334155;
}
.flow-status {
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  text-transform: capitalize;
}
.flow-status.active {
  background: #dcfce7;
  color: #166534;
}
.flow-status.success {
  background: #dcfce7;
  color: #166534;
}
.flow-status.running {
  background: #dbeafe;
  color: #1d4ed8;
}
.flow-status.failed {
  background: #fee2e2;
  color: #b91c1c;
}
.dark .flow-status.active {
  background: #064e3b;
  color: #34d399;
}
.dark .flow-status.success {
  background: #064e3b;
  color: #34d399;
}
.dark .flow-status.running {
  background: #1e3a8a;
  color: #93c5fd;
}
.dark .flow-status.failed {
  background: #7f1d1d;
  color: #fca5a5;
}
.flow-status.inactive {
  background: #f1f5f9;
  color: #475569;
}
.dark .flow-status.inactive {
  background: #334155;
  color: #94a3b8;
}
</style>
