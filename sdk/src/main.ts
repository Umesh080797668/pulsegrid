import { defineCustomElement } from 'vue';
import PulseTrigger from './components/PulseTrigger.ce.vue';
import PulseStatus from './components/PulseStatus.ce.vue';
import PulsePanel from './components/PulsePanel.ce.vue';

const PulseTriggerCE = defineCustomElement(PulseTrigger);
const PulseStatusCE = defineCustomElement(PulseStatus);
const PulsePanelCE = defineCustomElement(PulsePanel);

export function register() {
  customElements.define('pulse-trigger', PulseTriggerCE);
  customElements.define('pulse-status', PulseStatusCE);
  customElements.define('pulse-panel', PulsePanelCE);
}

// Auto-register if used directly via script tag
if (typeof window !== 'undefined') {
  register();
}

export { PulseTriggerCE, PulseStatusCE, PulsePanelCE };

