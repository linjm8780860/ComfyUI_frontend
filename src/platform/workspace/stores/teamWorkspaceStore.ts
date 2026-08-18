import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface PendingInvite {
  id: string
  email: string
  role: string
  created_at: string
  inviteDate?: string
  expiryDate?: string
}

export interface WorkspaceMember {
  id: string
  name: string
  email: string
  role: string
  avatar_url?: string
  joinDate?: string
}

export interface TeamWorkspace {
  id: string
  name: string
  type: string
  role: string
}

export const useTeamWorkspaceStore = defineStore('teamWorkspace', () => {
  const members = ref<WorkspaceMember[]>([])
  const pendingInvites = ref<PendingInvite[]>([])
  const isInPersonalWorkspace = ref(true)
  const workspaceName = ref('')
  const isInviteLimitReached = ref(false)
  const isWorkspaceSubscribed = ref(false)
  const initState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const workspaces = ref<TeamWorkspace[]>([])
  const activeWorkspace = ref<TeamWorkspace | null>(null)
  const workspaceId = ref<string>('')
  const canCreateWorkspace = ref(true)
  const isFetchingWorkspaces = ref(false)

  async function initialize() {}
  async function fetchMembers() {}
  async function fetchPendingInvites() {}
  function copyInviteLink(_id?: string) {
    return ''
  }
  async function createWorkspace(_name?: string) {}
  async function deleteWorkspace(_id?: string) {}
  async function updateWorkspaceName(_name?: string) {}
  async function createInviteLink(_email?: string, _role?: string) {
    return ''
  }
  async function leaveWorkspace() {}
  async function removeMember(_memberId?: string) {}
  async function revokeInvite(_inviteId?: string) {}
  async function switchWorkspace(_workspaceId: string) {}
  async function acceptInvite(_token?: string) {}
  async function fetchWorkspaces() {}

  return {
    members,
    pendingInvites,
    isInPersonalWorkspace,
    workspaceName,
    isInviteLimitReached,
    isWorkspaceSubscribed,
    initState,
    workspaces,
    activeWorkspace,
    workspaceId,
    canCreateWorkspace,
    isFetchingWorkspaces,
    initialize,
    fetchMembers,
    fetchPendingInvites,
    copyInviteLink,
    createWorkspace,
    deleteWorkspace,
    updateWorkspaceName,
    createInviteLink,
    leaveWorkspace,
    removeMember,
    revokeInvite,
    switchWorkspace,
    acceptInvite,
    fetchWorkspaces
  }
})
