<script setup lang="ts">
import { ref } from 'vue';
import {
  buildPulseApiUrl,
  buildPulseAuthHeaders,
  parsePulseResponse,
  type PulseTriggerResponse,
} from '../lib/pulse-api';

const props = defineProps<{
  workspaceId?: string;
  flowId?: string;
  apiKey?: string;
  apiBaseUrl?: string;
  theme?: string;
}>();

const isFiring = ref(false);
const feedbackMessage = ref('');
const feedbackState = ref<'idle' | 'success' | 'error'>('idle');

const emit = defineEmits<{
  success: [payload: PulseTriggerResponse];
  error: [message: string];
}>();

const fireFlow = async () => {
  if (!props.workspaceId || !props.flowId || !props.apiKey) {
    feedbackState.value = 'error';
    feedbackMessage.value = 'workspace-id, flow-id, and api-key are required';
    console.error('PulseTrigger: workspace-id, flow-id, and api-key are required');
    return;
  }

  isFiring.value = true;
  feedbackState.value = 'idle';
  feedbackMessage.value = '';

  try {
    const response = await fetch(buildPulseApiUrl('/trigger', props.apiBaseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildPulseAuthHeaders(props.apiKey),
      },
      body: JSON.stringify({
        workspaceId: props.workspaceId,
        flowId: props.flowId,
        payload: {},
      }),
    });

    const payload = await parsePulseResponse<PulseTriggerResponse>(response);
    feedbackState.value = 'success';
    feedbackMessage.value = payload.message || `Flow triggered${payload.run_id ? ` (${payload.run_id})` : ''}`;
    emit('success', payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to trigger flow';
    feedbackState.value = 'error';
    feedbackMessage.value = message;
    emit('error', message);
  } finally {
    isFiring.value = false;
  }
};
</script>

<template>
  <div class="pulse-trigger-wrapper">
    <button :class="['pulse-trigger-btn', theme]" @click="fireFlow" :disabled="isFiring">
    <slot>{{ isFiring ? 'Firing...' : 'Trigger Flow' }}</slot>
    </button>
    <p v-if="feedbackMessage" :class="['pulse-trigger-feedback', feedbackState]">
      {{ feedbackMessage }}
    </p>
  </div>
</template>

<style>
.pulse-trigger-wrapper {
  display: inline-flex;
  flex-direction: column;
  gap: 0.5rem;
  font-family: inherit;
}

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

.pulse-trigger-feedback {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.25;
}

.pulse-trigger-feedback.success {
  color: #166534;
}

.pulse-trigger-feedback.error {
  color: #b91c1c;
}

.dark .pulse-trigger-feedback.success {
  color: #4ade80;
}

.dark .pulse-trigger-feedback.error {
  color: #fca5a5;
}
</style>
