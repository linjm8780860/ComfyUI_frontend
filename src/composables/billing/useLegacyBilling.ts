/** @deprecated Stubbed for non-cloud builds. Use useBillingContext instead. */
export function useLegacyBilling() {
  return {
    isInitialized: { value: true },
    subscription: { value: null },
    balance: { value: null },
    plans: { value: [] },
    currentPlanSlug: { value: null },
    isLoading: { value: false },
    error: { value: null },
    isActiveSubscription: { value: true },
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
