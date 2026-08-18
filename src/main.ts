import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'
import { createPinia } from 'pinia'
import 'primeicons/primeicons.css'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'
import { createApp } from 'vue'

import '@/lib/litegraph/public/css/litegraph.css'
import router from '@/router'
import { useBootstrapStore } from '@/stores/bootstrapStore'

import App from './App.vue'
import './assets/css/style.css'
import { i18n } from './i18n'

const ComfyUIPreset = definePreset(Aura, {
  semantic: {
    // @ts-expect-error fixme ts strict error
    primary: Aura['primitive'].blue
  }
})

const app = createApp(App)
const pinia = createPinia()

// Sentry: only load when enabled
if (__SENTRY_ENABLED__ && __SENTRY_DSN__) {
  import('@sentry/vue').then((Sentry) => {
    Sentry.init({
      app,
      dsn: __SENTRY_DSN__,
      release: __COMFYUI_FRONTEND_VERSION__,
      normalizeDepth: 8,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      integrations: []
    })
  })
}

app.directive('tooltip', Tooltip)
app
  .use(router)
  .use(PrimeVue, {
    theme: {
      preset: ComfyUIPreset,
      options: {
        prefix: 'p',
        cssLayer: {
          name: 'primevue',
          order: 'theme, base, primevue'
        },
        darkModeSelector: '.dark-theme'
      }
    }
  })
  .use(ConfirmationService)
  .use(ToastService)
  .use(pinia)
  .use(i18n)

const bootstrapStore = useBootstrapStore(pinia)
void bootstrapStore.startStoreBootstrap()

app.mount('#vue-app')
