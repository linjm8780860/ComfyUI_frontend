import { computed } from 'vue'

/** Current user stub - auth removed for localhost deployment */
export const useCurrentUser = () => {
  const isLoggedIn = computed(() => false)
  return {
    loading: computed(() => false),
    isLoggedIn,
    isApiKeyLogin: computed(() => false),
    isEmailProvider: computed(() => false),
    userDisplayName: computed(() => undefined),
    userEmail: computed(() => undefined),
    userPhotoUrl: computed(() => null),
    providerName: computed(() => undefined),
    providerIcon: computed(() => 'pi pi-user'),
    resolvedUserInfo: computed(() => null),
    handleSignOut: async () => {},
    handleSignIn: async () => {},
    onUserResolved: (_callback: (user: unknown) => void) => {},
    onTokenRefreshed: (_callback: () => void) => {},
    onUserLogout: (_callback: () => void) => {}
  }
}
