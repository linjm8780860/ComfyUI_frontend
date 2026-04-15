// We should consider moving to https://primevue.org/dynamicdialog/ once everything is in Vue.
// Currently we need to bridge between legacy app code and Vue app with a Pinia store.
import { merge } from 'es-toolkit/compat'
import { defineStore } from 'pinia'
import type { DialogPassThroughOptions } from 'primevue/dialog'
import { markRaw, ref } from 'vue'
import type { Component, Ref } from 'vue'

import type { ComponentAttrs } from 'vue-component-type-helpers'

type DialogPosition =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'topleft'
  | 'topright'
  | 'bottomleft'
  | 'bottomright'

interface CustomDialogComponentProps {
  maximizable?: boolean
  maximized?: boolean
  onMaximize?: () => void
  onUnmaximize?: () => void
  onAfterHide?: () => void
  onClose?: () => void
  closable?: boolean
  modal?: boolean
  position?: DialogPosition
  pt?: DialogPassThroughOptions
  closeOnEscape?: boolean
  dismissableMask?: boolean
  unstyled?: boolean
  headless?: boolean
}

export type DialogComponentProps = CustomDialogComponentProps & {
  [key: string]: unknown
}

export interface DialogInstance<
  H extends Component = Component,
  B extends Component = Component,
  F extends Component = Component
> {
  key: string
  visible: boolean
  title?: string
  headerComponent?: H
  headerProps?: ComponentAttrs<H>
  component: B
  contentProps: ComponentAttrs<B>
  footerComponent?: F
  footerProps?: ComponentAttrs<F>
  dialogComponentProps: DialogComponentProps
  priority: number
}

type StoredDialogProps = Record<string, unknown>

interface StoredDialogInstance {
  key: string
  visible: boolean
  title?: string
  headerComponent?: Component
  headerProps?: StoredDialogProps
  component: Component
  contentProps: StoredDialogProps
  footerComponent?: Component
  footerProps?: StoredDialogProps
  dialogComponentProps: DialogComponentProps
  priority: number
}

export interface ShowDialogOptions<
  H extends Component = Component,
  B extends Component = Component,
  F extends Component = Component
> {
  key?: string
  title?: string
  headerComponent?: H
  footerComponent?: F
  component: B
  props?: ComponentAttrs<B>
  headerProps?: ComponentAttrs<H>
  footerProps?: ComponentAttrs<F>
  dialogComponentProps?: DialogComponentProps
  /**
   * Optional priority for dialog stacking.
   * A dialog will never be shown above a dialog with a higher priority.
   * @default 1
   */
  priority?: number
}

interface DialogStore {
  dialogStack: Ref<StoredDialogInstance[]>
  riseDialog: (options: { key: string }) => void
  closeDialog: (options?: { key: string }) => void
  showDialog: <
    H extends Component = Component,
    B extends Component = Component,
    F extends Component = Component
  >(
    options: ShowDialogOptions<H, B, F>
  ) => StoredDialogInstance
  showExtensionDialog: (
    options: ShowDialogOptions & { key: string }
  ) => StoredDialogInstance | undefined
  isDialogOpen: (key: string) => boolean
  activeKey: Ref<string | null>
}

export const useDialogStore = defineStore('dialog', (): DialogStore => {
  const dialogStack = ref<StoredDialogInstance[]>([])

  /**
   * The key of the currently active (top-most) dialog.
   * Only the active dialog can be closed with the ESC key.
   */
  const activeKey = ref<string | null>(null)

  const genDialogKey = () => `dialog-${Math.random().toString(36).slice(2, 9)}`

  /**
   * Inserts a dialog into the stack at the correct position based on priority.
   * Higher priority dialogs are placed before lower priority ones.
   */
  function insertDialogByPriority(dialog: StoredDialogInstance) {
    const insertIndex = dialogStack.value.findIndex(
      (d) => d.priority <= dialog.priority
    )
    const targetIndex =
      insertIndex === -1 ? dialogStack.value.length : insertIndex

    dialogStack.value = [
      ...dialogStack.value.slice(0, targetIndex),
      dialog,
      ...dialogStack.value.slice(targetIndex)
    ]
  }

  function removeDialogAtIndex(
    index: number
  ): StoredDialogInstance | undefined {
    const dialog = dialogStack.value[index]

    if (!dialog) return

    dialogStack.value = [
      ...dialogStack.value.slice(0, index),
      ...dialogStack.value.slice(index + 1)
    ]

    return dialog
  }

  function riseDialog(options: { key: string }) {
    const dialogKey = options.key

    const index = dialogStack.value.findIndex((d) => d.key === dialogKey)
    if (index !== -1) {
      const dialog = removeDialogAtIndex(index)
      if (!dialog) return
      insertDialogByPriority(dialog)
      activeKey.value = dialogKey
      updateCloseOnEscapeStates()
    }
  }

  function closeDialog(options?: { key: string }) {
    const targetDialog = options
      ? dialogStack.value.find((d) => d.key === options.key)
      : dialogStack.value.find((d) => d.key === activeKey.value)
    if (!targetDialog) return

    targetDialog.dialogComponentProps?.onClose?.()
    const index = dialogStack.value.indexOf(targetDialog)
    removeDialogAtIndex(index)

    activeKey.value =
      dialogStack.value.length > 0
        ? dialogStack.value[dialogStack.value.length - 1].key
        : null

    updateCloseOnEscapeStates()
  }

  function createDialog<
    H extends Component = Component,
    B extends Component = Component,
    F extends Component = Component
  >(
    options: ShowDialogOptions<H, B, F> & { key: string }
  ): StoredDialogInstance {
    if (dialogStack.value.length >= 10) {
      dialogStack.value = dialogStack.value.slice(1)
    }

    const dialog: StoredDialogInstance = {
      key: options.key,
      visible: true,
      title: options.title,
      headerComponent: options.headerComponent
        ? markRaw(options.headerComponent)
        : undefined,
      footerComponent: options.footerComponent
        ? markRaw(options.footerComponent)
        : undefined,
      component: markRaw(options.component),
      headerProps: options.headerProps
        ? { ...(options.headerProps as StoredDialogProps) }
        : undefined,
      contentProps: { ...(options.props as StoredDialogProps | undefined) },
      footerProps: options.footerProps
        ? { ...(options.footerProps as StoredDialogProps) }
        : undefined,
      priority: options.priority ?? 1,
      dialogComponentProps: {
        maximizable: false,
        modal: true,
        closable: true,
        closeOnEscape: true,
        dismissableMask: true,
        ...options.dialogComponentProps,
        maximized: false,
        onMaximize: () => {
          dialog.dialogComponentProps.maximized = true
        },
        onUnmaximize: () => {
          dialog.dialogComponentProps.maximized = false
        },
        onAfterHide: () => {
          closeDialog(dialog)
        },
        pt: merge(options.dialogComponentProps?.pt || {}, {
          root: {
            onMousedown: () => {
              riseDialog(dialog)
            }
          }
        })
      }
    }

    insertDialogByPriority(dialog)
    activeKey.value = options.key
    updateCloseOnEscapeStates()

    return dialog
  }

  /**
   * Ensures only the top-most dialog in the stack can be closed with the Escape key.
   * This is necessary because PrimeVue Dialogs do not handle `closeOnEscape` prop
   * correctly when multiple dialogs are open.
   */
  function updateCloseOnEscapeStates() {
    const topDialog = dialogStack.value.find((d) => d.key === activeKey.value)
    const topClosable = topDialog?.dialogComponentProps.closable

    dialogStack.value.forEach((dialog) => {
      dialog.dialogComponentProps = {
        ...dialog.dialogComponentProps,
        closeOnEscape: dialog === topDialog && !!topClosable
      }
    })
  }

  function showDialog<
    H extends Component = Component,
    B extends Component = Component,
    F extends Component = Component
  >(options: ShowDialogOptions<H, B, F>) {
    const dialogKey = options.key || genDialogKey()

    let dialog = dialogStack.value.find((d) => d.key === dialogKey)

    if (dialog) {
      dialog.visible = true
      riseDialog(dialog)
    } else {
      dialog = createDialog({ ...options, key: dialogKey })
    }
    return dialog
  }

  /**
   * Shows a dialog from a third party extension.
   * Explicitly keys extension dialogs with `extension-` prefix,
   * to avoid conflicts & prevent use of internal dialogs (available via `dialogService`).
   */
  function showExtensionDialog(options: ShowDialogOptions & { key: string }) {
    const { key } = options
    if (!key) {
      console.error('Extension dialog key is required')
      return
    }

    const extKey = key.startsWith('extension-') ? key : `extension-${key}`

    const dialog = dialogStack.value.find((d) => d.key === extKey)
    if (!dialog) return createDialog({ ...options, key: extKey })

    dialog.visible = true
    riseDialog(dialog)
    return dialog
  }

  function isDialogOpen(key: string) {
    return dialogStack.value.some((d) => d.key === key)
  }

  return {
    dialogStack,
    riseDialog,
    showDialog,
    closeDialog,
    showExtensionDialog,
    isDialogOpen,
    activeKey
  }
})
