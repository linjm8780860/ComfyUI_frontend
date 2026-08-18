import { ref } from 'vue'

/** Auth actions stub - removed for localhost deployment */
export const useFirebaseAuthActions = () => {
  const accessError = ref(false)
  return {
    logout: async () => {},
    sendPasswordReset: async (_email: string) => {},
    purchaseCredits: async (_amount: number) => {},
    accessBillingPortal: async (
      _targetTier?: unknown,
      _openInNewTab?: boolean
    ) => {},
    fetchBalance: async () => undefined,
    signInWithGoogle: async () => {},
    signInWithGithub: async () => {},
    signInWithEmail: async (_email: string, _password: string) => {},
    signUpWithEmail: async (_email: string, _password: string) => {},
    updatePassword: async (_newPassword: string) => {},
    reportError: (_error: unknown) => {},
    accessError
  }
}
