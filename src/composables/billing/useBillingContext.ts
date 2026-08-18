import { computed, ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'

import type { BillingContext } from './types'

/**
 * Stub billing context for non-cloud (localhost/desktop) builds.
 * Always returns an active subscription — no billing enforcement.
 */
function useBillingContextInternal(): BillingContext {
  const isInitialized = ref(true)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  return {
    type: computed(() => 'legacy' as const),
    isInitialized,
    subscription: computed(() => null),
    balance: computed(() => null),
    plans: computed(() => []),
    currentPlanSlug: computed(() => null),
    isLoading,
    error,
    isActiveSubscription: computed(() => true),

    initialize: async () => {},
    fetchStatus: async () => {},
    fetchBalance: async () => {},
    subscribe: async () => {},
    previewSubscribe: async () => null,
    manageSubscription: async () => {},
    cancelSubscription: async () => {},
    fetchPlans: async () => {},
    requireActiveSubscription: async () => {},
    showSubscriptionDialog: () => {}
  }
}

export const useBillingContext = createSharedComposable(
  useBillingContextInternal
)
