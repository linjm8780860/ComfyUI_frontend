import { useErrorHandling } from '@/composables/useErrorHandling'
import { legacyMenuCompat } from '@/lib/litegraph/src/contextMenuCompat'
import { useSettingStore } from '@/platform/settings/settingStore'
import { api } from '@/scripts/api'
import { useCommandStore } from '@/stores/commandStore'
import { useExtensionStore } from '@/stores/extensionStore'
import { KeybindingImpl } from '@/platform/keybindings/keybinding'
import { useKeybindingStore } from '@/platform/keybindings/keybindingStore'
// BizyAir: Service Worker runtime cache purging is temporarily disabled.
// Restore this import with the call below when SW is re-enabled.
// import { purgeManagedRuntimeCaches } from '@/services/pwa/serviceWorkerManager'
import { useMenuItemStore } from '@/stores/menuItemStore'
import { useWidgetStore } from '@/stores/widgetStore'
import { useBottomPanelStore } from '@/stores/workspace/bottomPanelStore'
import type { ComfyExtension } from '@/types/comfy'
import { app } from '@/scripts/app'
import type { ComfyApp } from '@/scripts/app'

const EXTENSIONS_CACHE_VERSION_PARAM = 'extv'
const EXTENSIONS_CACHE_VERSION_STORAGE_KEY = 'comfy.extensions.cacheVersion'

async function purgeExtensionsCacheForUrlVersion(): Promise<void> {
  if (typeof window === 'undefined') return

  const extensionsCacheVersion = new URLSearchParams(
    window.location.search
  ).get(EXTENSIONS_CACHE_VERSION_PARAM)
  if (!extensionsCacheVersion) return

  const previousVersion = window.localStorage.getItem(
    EXTENSIONS_CACHE_VERSION_STORAGE_KEY
  )
  if (previousVersion === extensionsCacheVersion) return

  // BizyAir: Service Worker runtime cache purging is temporarily disabled.
  // await purgeManagedRuntimeCaches(['extensions'], {
  //   waitForReady: false
  // })

  window.localStorage.setItem(
    EXTENSIONS_CACHE_VERSION_STORAGE_KEY,
    extensionsCacheVersion
  )
}

export const useExtensionService = () => {
  const extensionStore = useExtensionStore()
  const settingStore = useSettingStore()
  const keybindingStore = useKeybindingStore()
  const { wrapWithErrorHandling } = useErrorHandling()

  /**
   * Loads all extensions from the API into the window in parallel
   */
  const loadExtensions = async () => {
    await purgeExtensionsCacheForUrlVersion()

    extensionStore.loadDisabledExtensionNames(
      settingStore.get('Comfy.Extension.Disabled')
    )

    const extensions = await api.getExtensions()

    // Need to load core extensions first as some custom extensions
    // may depend on them.
    await import('../extensions/core/index')
    extensionStore.captureCoreExtensions()
    // Use allSettled so one failed extension doesn't block others.
    // Retry once on failure to handle transient network issues.
    const extList = extensions.filter(
      (extension) => !extension.includes('extensions/core')
    )
    const results = await Promise.allSettled(
      extList.map(async (ext) => {
        try {
          await import(/* @vite-ignore */ api.fileURL(ext))
        } catch (error) {
          // Retry once after a short delay (transient network failure)
          try {
            await new Promise((r) => setTimeout(r, 500))
            await import(/* @vite-ignore */ api.fileURL(ext))
          } catch (retryError) {
            console.error(
              'Error loading extension (retry failed)',
              ext,
              retryError
            )
          }
        }
      })
    )
    // Log summary of failures
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0) {
      console.warn(
        `[PerfOpt] ${failed.length}/${results.length} extensions failed to load`
      )
    }
  }

  /**
   * Register an extension with the app
   * @param extension The extension to register
   */
  const registerExtension = (extension: ComfyExtension) => {
    extensionStore.registerExtension(extension)

    const addKeybinding = wrapWithErrorHandling(
      keybindingStore.addDefaultKeybinding
    )
    const addSetting = wrapWithErrorHandling(settingStore.addSetting)

    extension.keybindings?.forEach((keybinding) => {
      addKeybinding(new KeybindingImpl(keybinding))
    })
    useCommandStore().loadExtensionCommands(extension)
    useMenuItemStore().loadExtensionMenuCommands(extension)
    extension.settings?.forEach(addSetting)
    useBottomPanelStore().registerExtensionBottomPanelTabs(extension)
    if (extension.getCustomWidgets) {
      // TODO(huchenlei): We should deprecate the async return value of
      // getCustomWidgets.
      void (async () => {
        if (extension.getCustomWidgets) {
          const widgets = await extension.getCustomWidgets(app)
          useWidgetStore().registerCustomWidgets(widgets)
        }
      })()
    }
  }

  type FunctionPropertyNames<T> = {
    [K in keyof T]: T[K] extends (...args: unknown[]) => unknown ? K : never
  }[keyof T]
  type RemoveLastAppParam<T> = T extends (
    ...args: [...infer Rest, ComfyApp]
  ) => infer R
    ? (...args: Rest) => R
    : T

  type ComfyExtensionParamsWithoutApp<T extends keyof ComfyExtension> =
    RemoveLastAppParam<ComfyExtension[T]>
  /**
   * Invoke an extension callback
   * @param {keyof ComfyExtension} method The extension callback to execute
   * @param  {unknown[]} args Any arguments to pass to the callback
   * @returns
   */
  const invokeExtensions = <T extends FunctionPropertyNames<ComfyExtension>>(
    method: T,
    ...args: Parameters<ComfyExtensionParamsWithoutApp<T>>
  ) => {
    const results: ReturnType<ComfyExtension[T]>[] = []
    for (const ext of extensionStore.enabledExtensions) {
      if (method in ext) {
        try {
          results.push(ext[method](...args, app))
        } catch (error) {
          console.error(
            `Error calling extension '${ext.name}' method '${method}'`,
            { error },
            { extension: ext },
            { args }
          )
        }
      }
    }
    return results
  }

  /**
   * Invoke an async extension callback
   * Each callback will be invoked concurrently
   * @param {string} method The extension callback to execute
   * @param  {...unknown} args Any arguments to pass to the callback
   * @returns
   */
  const invokeExtensionsAsync = async <
    T extends FunctionPropertyNames<ComfyExtension>
  >(
    method: T,
    ...args: Parameters<ComfyExtensionParamsWithoutApp<T>>
  ) => {
    return await Promise.all(
      extensionStore.enabledExtensions.map(async (ext) => {
        if (method in ext) {
          try {
            // Set current extension name for legacy compatibility tracking
            if (method === 'setup') {
              legacyMenuCompat.setCurrentExtension(ext.name)
            }

            const result = await ext[method](...args, app)

            // Clear current extension after setup
            if (method === 'setup') {
              legacyMenuCompat.setCurrentExtension(null)
            }

            return result
          } catch (error) {
            // Clear current extension on error too
            if (method === 'setup') {
              legacyMenuCompat.setCurrentExtension(null)
            }

            console.error(
              `Error calling extension '${ext.name}' method '${method}'`,
              { error },
              { extension: ext },
              { args }
            )
          }
        }
      })
    )
  }

  return {
    loadExtensions,
    registerExtension,
    invokeExtensions,
    invokeExtensionsAsync
  }
}
