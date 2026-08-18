import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

/** API Key auth store stub - removed for localhost deployment */
export const useApiKeyAuthStore = defineStore('apiKeyAuth', () => {
  const currentUser = ref(null)
  const isAuthenticated = computed(() => false)

  async function storeApiKey() {
    return true
  }
  async function clearStoredApiKey() {
    return true
  }
  function getAuthHeader() {
    return null
  }
  function getApiKey() {
    return null
  }

  return {
    currentUser,
    isAuthenticated,
    storeApiKey,
    clearStoredApiKey,
    getAuthHeader,
    getApiKey
  }
})
