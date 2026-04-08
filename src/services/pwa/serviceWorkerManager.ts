import type { Pinia } from 'pinia'
import type { Workbox } from 'workbox-window'
import { watch } from 'vue'

import { isDesktop } from '@/platform/distribution/types'
import { useExecutionStore } from '@/stores/executionStore'
import { useQueueStore } from '@/stores/queueStore'

import {
  getServiceWorkerScopePath,
  getServiceWorkerUrl,
  isManagedFrontendAssetUrl,
  shouldActivateWaitingServiceWorker
} from './serviceWorkerPaths'
import {
  normalizeRuntimeCacheGroups,
  PURGE_RUNTIME_CACHES_MESSAGE,
  type RuntimeCacheGroup
} from './runtimeCacheProtocol'

type RefreshReason = 'stale-asset' | 'update-available'

let initializationStarted = false
let activationRequested = false
let reloadScheduled = false
let waitingWorkerAvailable = false
let waitingWorkerIsUpdate = false
let piniaInstance: Pinia | undefined
let serviceWorkerScopePath = '/'
let workboxInstance: Workbox | undefined

function canUseServiceWorker(): boolean {
  if (typeof window === 'undefined') return false
  if (!import.meta.env.PROD || isDesktop) return false
  if (!('serviceWorker' in navigator)) return false

  return (
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  )
}

function shouldActivateNow(): boolean {
  if (!piniaInstance) return false

  const executionStore = useExecutionStore(piniaInstance)
  const queueStore = useQueueStore(piniaInstance)

  return shouldActivateWaitingServiceWorker(
    executionStore.isIdle,
    queueStore.activeJobsCount
  )
}

function hardReload(reason: RefreshReason) {
  if (reloadScheduled || typeof window === 'undefined') return

  reloadScheduled = true
  console.warn('[pwa] Reloading page to recover frontend assets.', { reason })
  window.location.reload()
}

function activateWaitingWorker(reason: RefreshReason) {
  if (!workboxInstance || !waitingWorkerAvailable || activationRequested) return
  if (!shouldActivateNow()) return

  activationRequested = true
  reloadScheduled = waitingWorkerIsUpdate || reason === 'stale-asset'

  console.info('[pwa] Activating waiting service worker.', {
    reason,
    reloadScheduled
  })
  workboxInstance.messageSkipWaiting()
}

function scheduleUpdateCheck() {
  void workboxInstance?.update()
}

async function postToServiceWorker(
  message: Record<string, unknown>
): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const targetWorker =
      navigator.serviceWorker.controller || registration.active

    if (!targetWorker) return false

    targetWorker.postMessage(message)
    return true
  } catch (error) {
    console.error(
      '[pwa] Failed to post a message to the service worker.',
      error
    )
    return false
  }
}

export async function initializeServiceWorkerManager(
  pinia: Pinia
): Promise<void> {
  if (initializationStarted || !canUseServiceWorker()) return

  initializationStarted = true
  piniaInstance = pinia
  serviceWorkerScopePath = getServiceWorkerScopePath(import.meta.url)

  try {
    const { Workbox } = await import('workbox-window')
    const serviceWorkerUrl = getServiceWorkerUrl(import.meta.url)

    workboxInstance = new Workbox(serviceWorkerUrl.href, {
      scope: serviceWorkerScopePath
    })

    workboxInstance.addEventListener('waiting', (event) => {
      waitingWorkerAvailable = true
      waitingWorkerIsUpdate = !!event.isUpdate
      activateWaitingWorker('update-available')
    })

    workboxInstance.addEventListener('activated', () => {
      waitingWorkerAvailable = false
      waitingWorkerIsUpdate = false
      activationRequested = false
    })

    workboxInstance.addEventListener('controlling', (event) => {
      if (reloadScheduled || event.isUpdate) {
        window.location.reload()
      }
    })

    await workboxInstance.register()

    const executionStore = useExecutionStore(pinia)
    const queueStore = useQueueStore(pinia)

    watch(
      () => [executionStore.isIdle, queueStore.activeJobsCount] as const,
      ([isExecutionIdle, activeJobsCount]) => {
        if (
          waitingWorkerAvailable &&
          shouldActivateWaitingServiceWorker(isExecutionIdle, activeJobsCount)
        ) {
          activateWaitingWorker('update-available')
        }
      },
      { immediate: true }
    )

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        scheduleUpdateCheck()
      }
    })

    window.addEventListener('online', scheduleUpdateCheck)
  } catch (error) {
    console.error('[pwa] Failed to initialize service worker.', error)
  }
}

export function recoverManagedAssetLoad(rawUrl: string | null): boolean {
  if (typeof window === 'undefined' || !rawUrl) return false

  const isManagedAsset = isManagedFrontendAssetUrl(
    rawUrl,
    window.location.origin,
    serviceWorkerScopePath
  )

  if (!isManagedAsset) return false

  if (waitingWorkerAvailable) {
    activateWaitingWorker('stale-asset')
    if (!activationRequested) {
      console.warn(
        '[pwa] Deferred service worker activation until the queue is idle.'
      )
    }
  } else {
    void purgeManagedRuntimeCaches(['static', 'data'])
      .catch((error) => {
        console.error('[pwa] Failed to purge stale runtime caches.', error)
      })
      .finally(() => {
        hardReload('stale-asset')
      })
  }

  return true
}

export async function purgeManagedRuntimeCaches(
  groups?: readonly RuntimeCacheGroup[]
): Promise<boolean> {
  const normalizedGroups = normalizeRuntimeCacheGroups(groups)

  return postToServiceWorker({
    type: PURGE_RUNTIME_CACHES_MESSAGE,
    groups: normalizedGroups
  })
}
