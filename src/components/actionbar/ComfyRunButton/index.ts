import { defineAsyncComponent } from 'vue'

export default false && window.__CONFIG__?.subscription_required
  ? defineAsyncComponent(() => import('./CloudRunButtonWrapper.vue'))
  : defineAsyncComponent(() => import('./ComfyQueueButton.vue'))
