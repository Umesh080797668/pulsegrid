<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  workspaceId?: string;
  apiKey?: string;
  theme?: string;
}>();

const flows = ref([
  { id: 1, name: 'Onboarding Flow', status: 'active' },
  { id: 2, name: 'Data Sync', status: 'inactive' }
]);
</script>

<template>
  <div :class="['pulse-panel', theme]">
    <div class="panel-header">
      <h2>Flow Management</h2>
      <span class="workspace-badge" v-if="workspaceId">{{ workspaceId }}</span>
    </div>
    
    <div class="panel-content" v-if="workspaceId && apiKey">
      <ul class="flow-list">
        <li v-for="flow in flows" :key="flow.id" class="flow-item">
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
.dark .flow-status.active {
  background: #064e3b;
  color: #34d399;
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
