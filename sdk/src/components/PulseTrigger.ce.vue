<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  workspaceId?: string;
  apiKey?: string;
  theme?: string;
}>();

const isFiring = ref(false);

const fireFlow = async () => {
  if (!props.workspaceId || !props.apiKey) {
    console.error('PulseTrigger: workspace-id and api-key are required');
    return;
  }
  isFiring.value = true;
  try {
    // Add realistic fetch here if needed later, right now simulating APIs
    console.log(`Firing flow for workspace: ${props.workspaceId} with theme: ${props.theme || 'default'}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  } finally {
    isFiring.value = false;
  }
};
</script>

<template>
  <button :class="['pulse-trigger-btn', theme]" @click="fireFlow" :disabled="isFiring">
    <slot>{{ isFiring ? 'Firing...' : 'Trigger Flow' }}</slot>
  </button>
</template>

<style>
.pulse-trigger-btn {
  background-color: #3b82f6;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.25rem;
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: background-color 0.2s;
}
.pulse-trigger-btn:hover {
  background-color: #2563eb;
}
.pulse-trigger-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.pulse-trigger-btn.dark {
  background-color: #1e293b;
}
.pulse-trigger-btn.dark:hover {
  background-color: #0f172a;
}
</style>
