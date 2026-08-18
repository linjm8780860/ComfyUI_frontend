import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * Stubbed workspace auth store for non-cloud builds.
 * No workspace token management — all methods are no-ops.
 */
export class WorkspaceAuthError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'WorkspaceAuthError'
  }
}

export const useWorkspaceAuthStore = defineStore('workspaceAuth', () => {
  const currentWorkspace = ref(null)
  const workspaceToken = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<Error | null>(null)

  const isAuthenticated = computed(() => false)

  function init() {}
  function destroy() {}
  function initializeFromSession() {
    return false
  }
  async function switchWorkspace(_workspaceId?: string) {}
  async function refreshToken() {}
  function getWorkspaceAuthHeader() {
    return null
  }
  function clearWorkspaceContext() {}

  return {
    currentWorkspace,
    workspaceToken,
    isLoading,
    error,
    isAuthenticated,
    init,
    destroy,
    initializeFromSession,
    switchWorkspace,
    refreshToken,
    getWorkspaceAuthHeader,
    clearWorkspaceContext
  }
})
