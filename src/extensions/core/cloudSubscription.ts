import { watch } from 'vue'

import { useBillingContext } from '@/composables/billing/useBillingContext'
import { useExtensionService } from '@/services/extensionService'

/**
 * Cloud-only extension that enforces active subscription requirement
 */
useExtensionService().registerExtension({
  name: 'Comfy.Cloud.Subscription',

  setup: async () => {
    const isLoggedIn = { value: false }
    const { requireActiveSubscription } = useBillingContext()

    const checkSubscriptionStatus = () => {
      if (!isLoggedIn.value) return
      void requireActiveSubscription()
    }

    watch(() => isLoggedIn.value, checkSubscriptionStatus, {
      immediate: true
    })
  }
})
