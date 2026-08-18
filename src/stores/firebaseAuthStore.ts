import { ref } from 'vue'
import { defineStore } from 'pinia'

/** Auth store stub - all auth removed for localhost deployment */
export const useFirebaseAuthStore = defineStore('firebaseAuth', () => {
  const currentUser = ref(null)
  const isAuthenticated = ref(false)
  const loading = ref(false)
  const userId = ref<string | null>(null)

  async function getAuthHeader() {
    return null
  }
  async function getAuthToken() {
    return null
  }
  async function getFirebaseAuthHeader() {
    return null
  }

  return {
    currentUser,
    isAuthenticated,
    loading,
    userId,
    getAuthHeader,
    getAuthToken,
    getFirebaseAuthHeader
  }
})

export type { AuthUserInfo as AuthUser } from '@/types/authTypes'

export class FirebaseAuthStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FirebaseAuthStoreError'
  }
}
