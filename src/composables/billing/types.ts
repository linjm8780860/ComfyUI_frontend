import type { ComputedRef, Ref } from 'vue'

export type BillingType = 'legacy' | 'workspace'

export interface SubscriptionInfo {
  isActive: boolean
  tier: string | null
  duration: string | null
  planSlug: string | null
  renewalDate: string | null
  endDate: string | null
  isCancelled: boolean
  hasFunds: boolean
}

export interface BalanceInfo {
  amountMicros: number
  currency: string
  effectiveBalanceMicros?: number
  prepaidBalanceMicros?: number
  cloudCreditBalanceMicros?: number
}

export interface BillingActions {
  initialize: () => Promise<void>
  fetchStatus: () => Promise<void>
  fetchBalance: () => Promise<void>
  subscribe: (
    planSlug: string,
    returnUrl?: string,
    cancelUrl?: string
  ) => Promise<void>
  previewSubscribe: (planSlug: string) => Promise<null>
  manageSubscription: () => Promise<void>
  cancelSubscription: () => Promise<void>
  fetchPlans: () => Promise<void>
  requireActiveSubscription: () => Promise<void>
  showSubscriptionDialog: () => void
}

export interface BillingState {
  isInitialized: Ref<boolean>
  subscription: ComputedRef<SubscriptionInfo | null>
  balance: ComputedRef<BalanceInfo | null>
  plans: ComputedRef<unknown[]>
  currentPlanSlug: ComputedRef<string | null>
  isLoading: Ref<boolean>
  error: Ref<string | null>
  isActiveSubscription: ComputedRef<boolean>
}

export interface BillingContext extends BillingState, BillingActions {
  type: ComputedRef<BillingType>
}
