<script setup lang="ts">
import { ref, onMounted } from 'vue';

const props = defineProps<{
  workspaceId?: string;
  apiKey?: string;
  theme?: string;
}>();

const status = ref('Ready');
const lastRun = ref('');

onMounted(() => {
  if (props.workspaceId) {
    status.value = 'Idle';
    lastRun.value = new Date().toISOString();
  } else {
    status.value = 'Unconfigured';
  }
});
</script>

<template>
  <div :class="['pulse-status-container', theme]">
    <div class="status-indicator">
      <span class="dot" :class="status.toLowerCase()"></span>
      <span class="status-text">{{ status }}</span>
    </div>
    <div class="last-run" v-if="lastRun">
      Last run: {{ new Date(lastRun).toLocaleString() }}
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
.dot.unconfigured { background-color: #f87171; }
.status-text {
  font-weight: 500;
  font-size: 0.875rem;
}
.last-run {
  font-size: 0.75rem;
  color: #64748b;
}
.dark .last-run {
  color: #94a3b8;
}
</style>
