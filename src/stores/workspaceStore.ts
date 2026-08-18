import { useMagicKeys } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useSettingStore } from '@/platform/settings/settingStore'
import { useToastStore } from '@/platform/updates/common/toastStore'
import { useWorkflowStore } from '@/platform/workflow/management/stores/workflowStore'
import type { Settings } from '@/schemas/apiSchema'
import { useColorPaletteService } from '@/services/colorPaletteService'
import { useDialogService } from '@/services/dialogService'
import type { SidebarTabExtension, ToastManager } from '@/types/extensionTypes'

import { useCommandStore } from './commandStore'
import { useQueueSettingsStore } from './queueStore'
import { useBottomPanelStore } from './workspace/bottomPanelStore'
import { useSidebarTabStore } from './workspace/sidebarTabStore'

function workspaceStoreSetup() {
  const spinner = ref(false)
  const { shift: shiftDown } = useMagicKeys()
  const focusMode = ref(false)

  const toast = computed<ToastManager>(() => useToastStore())
  const queueSettings = computed(() => useQueueSettingsStore())
  const command = computed(() => ({
    commands: useCommandStore().commands,
    execute: useCommandStore().execute
  }))
  const sidebarTab = computed(() => useSidebarTabStore())
  const setting = computed(() => ({
    settings: useSettingStore().settingsById,
    get: <T = unknown>(key: string): T | undefined =>
      useSettingStore().get(key as keyof Settings) as T | undefined,
    set: (key: string, value: unknown) =>
      useSettingStore().set(key as keyof Settings, value)
  }))
  const workflow = computed(() => useWorkflowStore())
  const colorPalette = useColorPaletteService()
  const dialog = useDialogService()
  const bottomPanel = useBottomPanelStore()

  const isApiKeyLogin = ref(false)
  const isLoggedIn = computed(() => isApiKeyLogin.value)
  const partialUserStore = { isLoggedIn }

  function registerSidebarTab(tab: SidebarTabExtension) {
    sidebarTab.value.registerSidebarTab(tab)
  }

  function unregisterSidebarTab(id: string) {
    sidebarTab.value.unregisterSidebarTab(id)
  }

  function getSidebarTabs(): SidebarTabExtension[] {
    return sidebarTab.value.sidebarTabs
  }

  return {
    spinner,
    shiftDown,
    focusMode,
    toggleFocusMode: () => {
      focusMode.value = !focusMode.value
    },
    toast,
    queueSettings,
    command,
    sidebarTab,
    setting,
    workflow,
    colorPalette,
    dialog,
    bottomPanel,
    user: partialUserStore,

    registerSidebarTab,
    unregisterSidebarTab,
    getSidebarTabs
  }
}

export const useWorkspaceStore = defineStore('workspace', workspaceStoreSetup)
