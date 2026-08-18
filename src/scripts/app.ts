import { useEventListener, useResizeObserver } from '@vueuse/core'
import _ from 'es-toolkit/compat'
import type { ToastMessageOptions } from 'primevue/toast'
import { reactive, unref } from 'vue'
import { shallowRef } from 'vue'

import { useCanvasPositionConversion } from '@/composables/element/useCanvasPositionConversion'
import { layoutStore } from '@/renderer/core/layout/store/layoutStore'
import { flushScheduledSlotLayoutSync } from '@/renderer/extensions/vueNodes/composables/useSlotElementTracking'
import { registerProxyWidgets } from '@/core/graph/subgraph/proxyWidget'
import { t } from '@/i18n'
import type { IContextMenuValue } from '@/lib/litegraph/src/interfaces'
import {
  LGraph,
  LGraphCanvas,
  LGraphNode,
  LiteGraph
} from '@/lib/litegraph/src/litegraph'
import type { Vector2 } from '@/lib/litegraph/src/litegraph'
import type { IBaseWidget } from '@/lib/litegraph/src/types/widgets'
import { useSettingStore } from '@/platform/settings/settingStore'
import { useTelemetry } from '@/platform/telemetry'
import type { WorkflowOpenSource } from '@/platform/telemetry/types'
import { useToastStore } from '@/platform/updates/common/toastStore'
import { useWorkflowService } from '@/platform/workflow/core/services/workflowService'
import { ComfyWorkflow } from '@/platform/workflow/management/stores/workflowStore'
import { useWorkflowValidation } from '@/platform/workflow/validation/composables/useWorkflowValidation'
import {
  type ComfyApiWorkflow,
  type ComfyWorkflowJSON,
  type ModelFile,
  type NodeId,
  isSubgraphDefinition
} from '@/platform/workflow/validation/schemas/workflowSchema'
import type {
  ExecutionErrorWsMessage,
  NodeError,
  NodeExecutionOutput,
  ResultItem
} from '@/schemas/apiSchema'
import {
  type ComfyNodeDef as ComfyNodeDefV1,
  isComboInputSpecV1,
  isComboInputSpecV2
} from '@/schemas/nodeDefSchema'
import {
  type BaseDOMWidget,
  ComponentWidgetImpl,
  DOMWidgetImpl
} from '@/scripts/domWidget'
import { useDialogService } from '@/services/dialogService'
import { useExtensionService } from '@/services/extensionService'
import { useLitegraphService } from '@/services/litegraphService'
import { useSubgraphService } from '@/services/subgraphService'
import { useCommandStore } from '@/stores/commandStore'
import { useDomWidgetStore } from '@/stores/domWidgetStore'
import { useExecutionStore } from '@/stores/executionStore'
import { useExtensionStore } from '@/stores/extensionStore'
import { useNodeOutputStore } from '@/stores/imagePreviewStore'
import { useJobPreviewStore } from '@/stores/jobPreviewStore'
import { KeyComboImpl } from '@/platform/keybindings/keyCombo'
import { useKeybindingStore } from '@/platform/keybindings/keybindingStore'
import { useModelStore } from '@/stores/modelStore'
import { SYSTEM_NODE_DEFS, useNodeDefStore } from '@/stores/nodeDefStore'
import { useNodeReplacementStore } from '@/platform/nodeReplacement/nodeReplacementStore'
import { useWidgetStore } from '@/stores/widgetStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ComfyExtension, MissingNodeType } from '@/types/comfy'
import type { ExtensionManager } from '@/types/extensionTypes'
import type { NodeExecutionId } from '@/types/nodeIdentification'
import { graphToPrompt } from '@/utils/executionUtil'
import type { MissingNodeTypeExtraInfo } from '@/workbench/extensions/manager/types/missingNodeErrorTypes'
import { createMissingNodeTypeFromError } from '@/workbench/extensions/manager/utils/missingNodeErrorUtil'
import { anyItemOverlapsRect } from '@/utils/mathUtil'
import { collectAllNodes, forEachNode } from '@/utils/graphTraversalUtil'
import {
  getNodeByExecutionId,
  triggerCallbackOnAllNodes
} from '@/utils/graphTraversalUtil'
import {
  executeWidgetsCallback,
  fixLinkInputSlots,
  isImageNode
} from '@/utils/litegraphUtil'
import {
  createSharedObjectUrl,
  releaseSharedObjectUrl
} from '@/utils/objectUrlUtil'
import {
  findLegacyRerouteNodes,
  noNativeReroutes
} from '@/utils/migration/migrateReroute'
import { getSelectedModelsMetadata } from '@/workbench/utils/modelMetadataUtil'
import { deserialiseAndCreate } from '@/utils/vintageClipboard'

import { type ComfyApi, PromptExecutionError, api } from './api'
import { defaultGraph } from './defaultGraph'
import { importA1111 } from './pnginfo'
import { $el, ComfyUI } from './ui'
import { ComfyAppMenu } from './ui/menu/index'
import { clone } from './utils'
import { type ComfyWidgetConstructor } from './widgets'
import { ensureCorrectLayoutScale } from '@/renderer/extensions/vueNodes/layout/ensureCorrectLayoutScale'
import { extractFileFromDragEvent } from '@/utils/eventUtils'
import { getWorkflowDataFromFile } from '@/scripts/metadata/parser'
import { pasteImageNode } from '@/composables/usePaste'

export const ANIM_PREVIEW_WIDGET = '$$comfy_animation_preview'

export function sanitizeNodeName(string: string) {
  let entityMap = {
    '&': '',
    '<': '',
    '>': '',
    '"': '',
    "'": '',
    '`': '',
    '=': ''
  }
  return String(string).replace(/[&<>"'`=]/g, function fromEntityMap(s) {
    return entityMap[s as keyof typeof entityMap]
  })
}

type Clipspace = {
  widgets?: Pick<IBaseWidget, 'type' | 'name' | 'value'>[] | null
  imgs?: HTMLImageElement[] | null
  original_imgs?: HTMLImageElement[] | null
  images?: ResultItem[] | null
  selectedIndex: number
  img_paste_mode: string
  paintedIndex: number
  combinedIndex: number
}

export class ComfyApp {
  /**
   * List of entries to queue
   */
  private queueItems: {
    number: number
    batchCount: number
    queueNodeIds?: NodeExecutionId[]
  }[] = []
  /**
   * If the queue is currently being processed
   */
  private processingQueue: boolean = false

  /**
   * Content Clipboard
   * @type {serialized node object}
   */
  static clipspace: Clipspace | null = null
  static clipspace_invalidate_handler: (() => void) | null = null
  static open_maskeditor: (() => void) | null = null
  static maskeditor_is_opended: (() => void) | null = null
  static clipspace_return_node = null

  vueAppReady: boolean
  api: ComfyApi
  ui: ComfyUI
  extensionManager!: ExtensionManager
  private _nodeOutputs!: Record<string, NodeExecutionOutput>
  nodePreviewImages: Record<string, string[]>

  private rootGraphInternal: LGraph | undefined

  // TODO: Migrate internal usage to the
  /** @deprecated Use {@link rootGraph} instead */
  get graph() {
    return this.rootGraphInternal!
  }

  get rootGraph(): LGraph {
    if (!this.rootGraphInternal) {
      console.error('ComfyApp graph accessed before initialization')
    }
    return this.rootGraphInternal!
  }

  canvas!: LGraphCanvas
  dragOverNode: LGraphNode | null = null
  readonly canvasElRef = shallowRef<HTMLCanvasElement>()
  get canvasEl() {
    // TODO: Fix possibly undefined reference
    return unref(this.canvasElRef)!
  }

  private configuringGraphLevel: number = 0
  get configuringGraph() {
    return this.configuringGraphLevel > 0
  }
  ctx!: CanvasRenderingContext2D
  bodyTop: HTMLElement
  bodyLeft: HTMLElement
  bodyRight: HTMLElement
  bodyBottom: HTMLElement
  canvasContainer: HTMLElement
  menu: ComfyAppMenu
  // Set by Comfy.Clipspace extension
  openClipspace: () => void = () => {}

  private positionConversion?: {
    clientPosToCanvasPos: (pos: Vector2) => Vector2
    canvasPosToClientPos: (pos: Vector2) => Vector2
  }

  // --- Lazy Node Registration (perf optimization) ---
  /** All node defs fetched from backend, stored but not yet registered with LiteGraph. */
  private _allNodeDefs: Map<string, ComfyNodeDefV1> = new Map()
  /** Node IDs that have been registered with LiteGraph. */
  private _registeredNodeIds: Set<string> = new Set()
  /** Prefetched /object_info promise, started in parallel with loadExtensions. */
  _objectInfoPromise: Promise<Response | null> | null = null
  /** Whether background batch registration has completed. */
  private _backgroundRegistrationDone = false

  /**
   * The node errors from the previous execution.
   * @deprecated Use useExecutionStore().lastNodeErrors instead
   */
  get lastNodeErrors(): Record<NodeId, NodeError> | null {
    return useExecutionStore().lastNodeErrors
  }

  /**
   * The error from the previous execution.
   * @deprecated Use useExecutionStore().lastExecutionError instead
   */
  get lastExecutionError(): ExecutionErrorWsMessage | null {
    return useExecutionStore().lastExecutionError
  }

  /**
   * @deprecated Use useExecutionStore().executingNodeId instead
   * TODO: Update to support multiple executing nodes. This getter returns only the first executing node.
   * Consider updating consumers to handle multiple nodes or use executingNodeIds array.
   */
  get runningNodeId(): NodeId | null {
    return useExecutionStore().executingNodeId
  }

  /**
   * @deprecated Use useWorkspaceStore().shiftDown instead
   */
  get shiftDown(): boolean {
    return useWorkspaceStore().shiftDown
  }

  /**
   * @deprecated Use useWidgetStore().widgets instead
   */
  get widgets(): Record<string, ComfyWidgetConstructor> {
    return Object.fromEntries(useWidgetStore().widgets.entries())
  }

  /**
   * @deprecated storageLocation is always 'server' since
   * https://github.com/comfyanonymous/ComfyUI/commit/53c8a99e6c00b5e20425100f6680cd9ea2652218
   */
  get storageLocation() {
    return 'server'
  }

  /**
   * @deprecated storage migration is no longer needed.
   */
  get isNewUserSession() {
    return false
  }

  /**
   * @deprecated Use useExtensionStore().extensions instead
   */
  get extensions(): ComfyExtension[] {
    return useExtensionStore().extensions
  }

  /**
   * The progress on the current executing node, if the node reports any.
   * @deprecated Use useExecutionStore().executingNodeProgress instead
   */
  get progress() {
    return useExecutionStore()._executingNodeProgress
  }

  /**
   * @deprecated Use {@link isImageNode} from @/utils/litegraphUtil instead
   */
  static isImageNode(node: LGraphNode) {
    return isImageNode(node)
  }

  /**
   * Resets the canvas view to the default
   * @deprecated Use {@link useLitegraphService().resetView} instead
   */
  resetView() {
    useLitegraphService().resetView()
  }

  constructor() {
    this.vueAppReady = false
    this.ui = new ComfyUI(this)
    this.api = api
    // Dummy placeholder elements before GraphCanvas is mounted.
    this.bodyTop = $el('div.comfyui-body-top')
    this.bodyLeft = $el('div.comfyui-body-left')
    this.bodyRight = $el('div.comfyui-body-right')
    this.bodyBottom = $el('div.comfyui-body-bottom')
    this.canvasContainer = $el('div.graph-canvas-container')

    this.menu = new ComfyAppMenu(this)

    /**
     * Stores the execution output data for each node
     * @type {Record<string, any>}
     */
    this.nodeOutputs = {}

    /**
     * Stores the preview image data for each node
     * @type {Record<string, Image>}
     */
    this.nodePreviewImages = {}
  }

  get nodeOutputs() {
    return this._nodeOutputs
  }

  set nodeOutputs(value) {
    this._nodeOutputs = value
    if (this.vueAppReady)
      useExtensionService().invokeExtensions('onNodeOutputsUpdated', value)
  }

  /**
   * If the user has specified a preferred format to receive preview images in,
   * this function will return that format as a url query param.
   * If the node's outputs are not images, this param should not be used, as it will
   * force the server to load the output file as an image.
   */
  getPreviewFormatParam() {
    let preview_format = useSettingStore().get('Comfy.PreviewFormat')
    if (preview_format) return `&preview=${preview_format}`
    else return ''
  }

  getRandParam() {
    if (false) return ''
    return '&rand=' + Math.random()
  }

  static onClipspaceEditorSave() {
    if (ComfyApp.clipspace_return_node) {
      ComfyApp.pasteFromClipspace(ComfyApp.clipspace_return_node)
    }
  }

  static onClipspaceEditorClosed() {
    ComfyApp.clipspace_return_node = null
  }

  static copyToClipspace(node: LGraphNode) {
    var widgets = null
    if (node.widgets) {
      widgets = node.widgets.map(({ type, name, value }) => ({
        type,
        name,
        value
      }))
    }

    var imgs = undefined
    var orig_imgs = undefined
    if (node.imgs != undefined) {
      imgs = []
      orig_imgs = []

      for (let i = 0; i < node.imgs.length; i++) {
        imgs[i] = new Image()
        imgs[i].src = node.imgs[i].src
        orig_imgs[i] = imgs[i]
      }
    }

    var selectedIndex = 0
    if (node.imageIndex) {
      selectedIndex = node.imageIndex
    }

    const paintedIndex = imgs ? imgs.length + 1 : 1
    const combinedIndex = imgs ? imgs.length + 2 : 2

    // for vueNodes mode
    const images =
      node.images ?? useNodeOutputStore().getNodeOutputs(node)?.images

    ComfyApp.clipspace = {
      widgets: widgets,
      imgs: imgs,
      original_imgs: orig_imgs,
      images: images,
      selectedIndex: selectedIndex,
      img_paste_mode: 'selected', // reset to default im_paste_mode state on copy action
      paintedIndex: paintedIndex,
      combinedIndex: combinedIndex
    }

    ComfyApp.clipspace_return_node = null

    if (ComfyApp.clipspace_invalidate_handler) {
      ComfyApp.clipspace_invalidate_handler()
    }
  }

  static pasteFromClipspace(node: LGraphNode) {
    if (ComfyApp.clipspace) {
      // image paste
      let combinedImgSrc: string | undefined
      if (
        ComfyApp.clipspace.combinedIndex !== undefined &&
        ComfyApp.clipspace.imgs &&
        ComfyApp.clipspace.combinedIndex < ComfyApp.clipspace.imgs.length
      ) {
        combinedImgSrc =
          ComfyApp.clipspace.imgs[ComfyApp.clipspace.combinedIndex].src
      }
      if (ComfyApp.clipspace.imgs && node.imgs) {
        // Update node.images even if it's initially undefined (vueNodes mode)
        if (ComfyApp.clipspace.images) {
          if (ComfyApp.clipspace['img_paste_mode'] == 'selected') {
            node.images = [
              ComfyApp.clipspace.images[ComfyApp.clipspace['selectedIndex']]
            ]
          } else {
            node.images = ComfyApp.clipspace.images
          }

          if (app.nodeOutputs[node.id + ''])
            app.nodeOutputs[node.id + ''].images = node.images
        }

        if (ComfyApp.clipspace.imgs) {
          // deep-copy to cut link with clipspace
          if (ComfyApp.clipspace['img_paste_mode'] == 'selected') {
            const img = new Image()
            img.src =
              ComfyApp.clipspace.imgs[ComfyApp.clipspace['selectedIndex']].src
            node.imgs = [img]
            node.imageIndex = 0
          } else {
            const imgs = []
            for (let i = 0; i < ComfyApp.clipspace.imgs.length; i++) {
              imgs[i] = new Image()
              imgs[i].src = ComfyApp.clipspace.imgs[i].src
              node.imgs = imgs
            }
          }
        }
      }

      // Paste the RGB canvas if paintedindex exists
      if (
        ComfyApp.clipspace.imgs?.[ComfyApp.clipspace.paintedIndex] &&
        node.imgs
      ) {
        const paintedImg = new Image()
        paintedImg.src =
          ComfyApp.clipspace.imgs[ComfyApp.clipspace.paintedIndex].src
        node.imgs.push(paintedImg) // Add the RGB canvas to the node's images
      }

      // Store only combined image inside the node if it exists
      if (
        ComfyApp.clipspace.imgs?.[ComfyApp.clipspace.combinedIndex] &&
        node.imgs &&
        combinedImgSrc
      ) {
        const combinedImg = new Image()
        combinedImg.src = combinedImgSrc
        node.imgs = [combinedImg]
      }

      if (node.widgets) {
        if (ComfyApp.clipspace.images) {
          const clip_image =
            ComfyApp.clipspace.images[ComfyApp.clipspace['selectedIndex']]
          const index = node.widgets.findIndex((obj) => obj.name === 'image')
          if (index >= 0) {
            if (
              node.widgets[index].type != 'image' &&
              typeof node.widgets[index].value == 'string' &&
              clip_image.filename
            ) {
              node.widgets[index].value =
                (clip_image.subfolder ? clip_image.subfolder + '/' : '') +
                clip_image.filename +
                (clip_image.type ? ` [${clip_image.type}]` : '')
            } else {
              node.widgets[index].value = clip_image
            }
          }
        }
        if (ComfyApp.clipspace.widgets && node.widgets) {
          ComfyApp.clipspace.widgets.forEach(({ type, name, value }) => {
            const prop = node.widgets?.find(
              (obj) => obj.type === type && obj.name === name
            )
            if (prop && prop.type != 'button') {
              const valueObj = value as Record<string, unknown> | undefined
              if (
                prop.type != 'image' &&
                typeof prop.value == 'string' &&
                valueObj?.filename
              ) {
                const resultItem = value as ResultItem
                prop.value =
                  (resultItem.subfolder ? resultItem.subfolder + '/' : '') +
                  resultItem.filename +
                  (resultItem.type ? ` [${resultItem.type}]` : '')
              } else {
                prop.value = value
                prop.callback?.(value)
              }
            }
          })
        }
      }

      app.canvas.setDirty(true)

      useNodeOutputStore().updateNodeImages(node)
    }
  }

  /**
   * Adds a handler allowing drag+drop of files onto the window to load workflows
   */
  private addDropHandler() {
    // Get prompt from dropped PNG or json
    useEventListener(document, 'drop', async (event: DragEvent) => {
      try {
        event.preventDefault()
        event.stopPropagation()

        const n = this.dragOverNode
        this.dragOverNode = null
        // Node handles file drop, we dont use the built in onDropFile handler as its buggy
        // If you drag multiple files it will call it multiple times with the same file
        if (await n?.onDragDrop?.(event)) return

        const fileMaybe = await extractFileFromDragEvent(event)
        if (!fileMaybe) return

        const workspace = useWorkspaceStore()
        try {
          workspace.spinner = true
          await this.handleFile(fileMaybe, 'file_drop')
        } finally {
          workspace.spinner = false
        }
      } catch (error: unknown) {
        useToastStore().addAlert(t('toastMessages.dropFileError', { error }))
      }
    })

    // Always clear over node on drag leave
    useEventListener(this.canvasElRef, 'dragleave', async () => {
      if (!this.dragOverNode) return
      this.dragOverNode = null
      this.canvas.setDirty(false, true)
    })

    // Add handler for dropping onto a specific node
    useEventListener(
      this.canvasElRef,
      'dragover',
      (event: DragEvent) => {
        this.canvas.adjustMouseEvent(event)
        const node = this.canvas.graph?.getNodeOnPos(
          event.canvasX,
          event.canvasY
        )

        if (!node?.onDragOver?.(event)) {
          this.dragOverNode = null
          return
        }

        this.dragOverNode = node

        // dragover event is fired very frequently, run this on an animation frame
        requestAnimationFrame(() => {
          this.canvas.setDirty(false, true)
        })
      },
      false
    )
  }

  /**
   * Handle keypress
   */
  private addProcessKeyHandler() {
    const origProcessKey = LGraphCanvas.prototype.processKey
    LGraphCanvas.prototype.processKey = function (e: KeyboardEvent) {
      if (!this.graph) return

      if (e.target instanceof Element && e.target.localName == 'input') {
        return
      }

      if (e.type == 'keydown' && !e.repeat) {
        const keyCombo = KeyComboImpl.fromEvent(e)
        const keybindingStore = useKeybindingStore()
        const keybinding = keybindingStore.getKeybinding(keyCombo)

        if (
          keybinding &&
          keybinding.targetElementId === 'graph-canvas-container'
        ) {
          useCommandStore().execute(keybinding.commandId)

          this.graph.change()
          e.preventDefault()
          e.stopImmediatePropagation()
          return
        }

        // Ctrl+C Copy
        if (e.key === 'c' && (e.metaKey || e.ctrlKey)) {
          return
        }

        // Ctrl+V Paste
        if (
          (e.key === 'v' || e.key == 'V') &&
          (e.metaKey || e.ctrlKey) &&
          !e.shiftKey
        ) {
          return
        }
      }

      // Fall through to Litegraph defaults
      return origProcessKey.apply(this, [e])
    }
  }

  /**
   * Handles updates from the API socket
   */
  private addApiUpdateHandlers() {
    api.addEventListener('status', ({ detail }) => {
      this.ui.setStatus(detail)
    })

    api.addEventListener('progress', () => {
      this.canvas.setDirty(true, false)
    })

    api.addEventListener('executing', () => {
      this.canvas.setDirty(true, false)
    })

    api.addEventListener('executed', ({ detail }) => {
      const nodeOutputStore = useNodeOutputStore()
      const executionId = String(detail.display_node || detail.node)

      nodeOutputStore.setNodeOutputsByExecutionId(executionId, detail.output, {
        merge: detail.merge
      })

      const node = getNodeByExecutionId(this.rootGraph, executionId)
      if (node && node.onExecuted) {
        node.onExecuted(detail.output)
      }
    })

    api.addEventListener('execution_start', () => {
      triggerCallbackOnAllNodes(this.rootGraph, 'onExecutionStart')
    })

    api.addEventListener('execution_error', ({ detail }) => {
      useDialogService().showExecutionErrorDialog(detail)
      this.canvas.draw(true, true)
    })

    api.addEventListener('b_preview_with_metadata', ({ detail }) => {
      // Enhanced preview with explicit node context
      const { blob, displayNodeId, promptId } = detail
      const { setNodePreviewsByExecutionId, revokePreviewsByExecutionId } =
        useNodeOutputStore()
      const blobUrl = createSharedObjectUrl(blob)
      useJobPreviewStore().setPreviewUrl(promptId, blobUrl)
      // Ensure clean up if `executing` event is missed.
      revokePreviewsByExecutionId(displayNodeId)
      // Preview cleanup is handled in progress_state event to support multiple concurrent previews
      const nodeParents = displayNodeId.split(':')
      for (let i = 1; i <= nodeParents.length; i++) {
        setNodePreviewsByExecutionId(nodeParents.slice(0, i).join(':'), [
          blobUrl
        ])
      }
      releaseSharedObjectUrl(blobUrl)
    })

    api.addEventListener('feature_flags', () => {
      void useNodeReplacementStore().load()
    })

    api.init()
  }

  /** Flag that the graph is configuring to prevent nodes from running checks while its still loading */
  private addConfigureHandler() {
    const app = this
    const configure = LGraph.prototype.configure
    LGraph.prototype.configure = function (...args) {
      app.configuringGraphLevel++
      try {
        return configure.apply(this, args)
      } finally {
        app.configuringGraphLevel--
      }
    }
  }

  private addAfterConfigureHandler(graph: LGraph) {
    const { onConfigure } = graph
    graph.onConfigure = function (...args) {
      // Set pending sync flag to suppress link rendering until slots are synced
      if (LiteGraph.vueNodesMode) {
        layoutStore.setPendingSlotSync(true)
      }

      try {
        fixLinkInputSlots(this)

        // Fire callbacks before the onConfigure, this is used by widget inputs to setup the config
        triggerCallbackOnAllNodes(this, 'onGraphConfigured')

        const r = onConfigure?.apply(this, args)

        // Fire after onConfigure, used by primitives to generate widget using input nodes config
        triggerCallbackOnAllNodes(this, 'onAfterGraphConfigured')

        return r
      } finally {
        // Flush pending slot layout syncs to fix link alignment after undo/redo
        // Using finally ensures links aren't permanently suppressed if an error occurs
        if (LiteGraph.vueNodesMode) {
          flushScheduledSlotLayoutSync()
          app.canvas?.setDirty(true, true)
        }
      }
    }
  }

  /**
   * Set up the app on the page
   */
  async setup(canvasEl: HTMLCanvasElement) {
    this.bodyTop = document.getElementById('comfyui-body-top')!
    this.bodyLeft = document.getElementById('comfyui-body-left')!
    this.bodyRight = document.getElementById('comfyui-body-right')!
    this.bodyBottom = document.getElementById('comfyui-body-bottom')!
    this.canvasContainer = document.getElementById('graph-canvas-container')!

    this.canvasElRef.value = canvasEl

    // PerfOpt: Prefetch /object_info ASAP - start before syncWorkflows and loadExtensions
    // Add 30s timeout - if prefetch hangs, getNodeDefs() will fallback to a fresh request
    this._objectInfoPromise = Promise.race([
      api.fetchApi('/object_info'),
      new Promise<Response>((_, reject) =>
        setTimeout(
          () => reject(new Error('[PerfOpt] /object_info prefetch timeout')),
          30000
        )
      )
    ]).catch((err) => {
      console.warn(
        '[PerfOpt] /object_info prefetch failed, will retry on demand:',
        err
      )
      return null
    }) as Promise<Response | null>
    console.log('[PerfOpt] /object_info prefetch started (ASAP)')

    // PerfOpt: Skip syncWorkflows and fetchSubgraphs - /api/userdata returns 404 on this deployment
    // These calls fetch workflow files from ComfyUI's built-in user data storage, which is not used.
    // Skipping saves 1-2 round trips (especially when the 404 response is slow).
    console.log('[PerfOpt] Skipping syncWorkflows (userdata API unavailable)')

    console.log('[PerfOpt] Starting loadExtensions')

    // PerfOpt: loadExtensions with timeout - some third-party extensions may hang
    await Promise.race([
      useExtensionService().loadExtensions(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('[PerfOpt] loadExtensions timeout after 60s')),
          60000
        )
      )
    ]).catch((err) => {
      console.error('[PerfOpt] loadExtensions failed or timed out:', err)
    })

    this.addProcessKeyHandler()
    this.addConfigureHandler()
    this.addApiUpdateHandlers()

    const graph = new LGraph()

    // Register the subgraph - adds type wrapper for Litegraph's `createNode` factory
    graph.events.addEventListener('subgraph-created', (e) => {
      try {
        const { subgraph, data } = e.detail
        useSubgraphService().registerNewSubgraph(subgraph, data)
      } catch (err) {
        console.error('Failed to register subgraph', err)
        useToastStore().add({
          severity: 'error',
          summary: 'Failed to register subgraph',
          detail: err instanceof Error ? err.message : String(err)
        })
      }
    })

    this.addAfterConfigureHandler(graph)

    this.rootGraphInternal = graph
    this.canvas = new LGraphCanvas(canvasEl, graph)
    // Make canvas states reactive so we can observe changes on them.
    this.canvas.state = reactive(this.canvas.state)

    this.ctx = canvasEl.getContext('2d')!

    LiteGraph.alt_drag_do_clone_nodes = true
    LiteGraph.macGesturesRequireMac = false

    this.canvas.canvas.addEventListener<'litegraph:set-graph'>(
      'litegraph:set-graph',
      (e) => {
        const { newGraph } = e.detail

        const widgetStore = useDomWidgetStore()

        const activeWidgets: Record<
          string,
          BaseDOMWidget<object | string>
        > = Object.fromEntries(
          newGraph.nodes
            .flatMap((node) => node.widgets ?? [])
            .filter(
              (w) =>
                w instanceof DOMWidgetImpl || w instanceof ComponentWidgetImpl
            )
            .map((w) => [w.id, w])
        )

        for (const [
          widgetId,
          widgetState
        ] of widgetStore.widgetStates.entries()) {
          if (widgetId in activeWidgets) {
            widgetState.active = true
            widgetState.widget = activeWidgets[widgetId]
          } else {
            widgetState.active = false
          }
        }
      }
    )

    // Ensure subgraphs are scaled when entering them
    this.canvas.canvas.addEventListener<'litegraph:set-graph'>(
      'litegraph:set-graph',
      (e) => {
        const { newGraph, oldGraph } = e.detail
        // Only scale when switching between graphs (not during initial setup)
        // oldGraph is null/undefined during initial setup, so skip scaling then
        if (oldGraph) {
          ensureCorrectLayoutScale(
            newGraph.extra.workflowRendererVersion,
            newGraph
          )
        }
      }
    )

    registerProxyWidgets(this.canvas)

    this.rootGraph.start()

    // Ensure the canvas fills the window
    useResizeObserver(this.canvasElRef, ([canvasEl]) => {
      if (canvasEl.target instanceof HTMLCanvasElement) {
        this.resizeCanvas(canvasEl.target)
      }
    })

    // PerfOpt: Extension init with timeout
    await Promise.race([
      useExtensionService().invokeExtensionsAsync('init'),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('[PerfOpt] init timeout after 30s')),
          30000
        )
      )
    ]).catch((err) => {
      console.error('[PerfOpt] Extension init failed or timed out:', err)
    })

    await this.registerNodes()

    this.addDropHandler()

    // PerfOpt: Extension setup with timeout
    await Promise.race([
      useExtensionService().invokeExtensionsAsync('setup'),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('[PerfOpt] setup timeout after 30s')),
          30000
        )
      )
    ]).catch((err) => {
      console.error('[PerfOpt] Extension setup failed or timed out:', err)
    })

    this.positionConversion = useCanvasPositionConversion(
      this.canvasContainer,
      this.canvas
    )

    // PerfOpt: Register remaining nodes in background batches (non-blocking)
    this.registerDeferredNodesInBackground()
  }

  private resizeCanvas(canvas: HTMLCanvasElement) {
    // Limit minimal scale to 1, see https://github.com/comfyanonymous/ComfyUI/pull/845
    const scale = Math.max(window.devicePixelRatio, 1)

    // Clear fixed width and height while calculating rect so it uses 100% instead
    canvas.height = canvas.width = NaN
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    canvas.getContext('2d')?.scale(scale, scale)
    this.canvas?.draw(true, true)
  }

  private updateVueAppNodeDefs(defs: Record<string, ComfyNodeDefV1>) {
    // Frontend only nodes registered by custom nodes.
    // Example: https://github.com/rgthree/rgthree-comfy/blob/dd534e5384be8cf0c0fa35865afe2126ba75ac55/src_web/comfyui/fast_groups_bypasser.ts#L10

    // Only create frontend_only definitions for nodes that don't have backend definitions
    const frontendOnlyDefs: Record<string, ComfyNodeDefV1> = {}
    for (const [name, node] of Object.entries(
      LiteGraph.registered_node_types
    )) {
      // Skip if we already have a backend definition or system definition
      if (name in defs || name in SYSTEM_NODE_DEFS || node.skip_list) {
        continue
      }

      frontendOnlyDefs[name] = {
        name,
        display_name: name,
        category: node.category || '__frontend_only__',
        input: { required: {}, optional: {} },
        output: [],
        output_name: [],
        output_is_list: [],
        output_node: false,
        python_module: 'custom_nodes.frontend_only',
        description: node.description ?? `Frontend only node for ${name}`
      } as ComfyNodeDefV1
    }

    const allNodeDefs = {
      ...frontendOnlyDefs,
      ...defs,
      ...SYSTEM_NODE_DEFS
    }

    const nodeDefStore = useNodeDefStore()
    const nodeDefArray: ComfyNodeDefV1[] = Object.values(allNodeDefs)
    useExtensionService().invokeExtensions(
      'beforeRegisterVueAppNodeDefs',
      nodeDefArray
    )
    nodeDefStore.updateNodeDefs(nodeDefArray)
  }

  // PerfOpt: Cache for getNodeDefs - avoid duplicate /object_info requests
  _nodeDefsCache: Record<string, ComfyNodeDefV1> | null = null
  _nodeDefsCacheTime: number = 0
  // Cache TTL: 60s. Within this window, return cached defs instead of re-fetching.
  static NODE_DEFS_CACHE_TTL = 60000

  async getNodeDefs(
    forceRefresh = false
  ): Promise<Record<string, ComfyNodeDefV1>> {
    // Return cached defs if fresh enough (unless force refresh)
    const now = Date.now()
    if (
      !forceRefresh &&
      this._nodeDefsCache &&
      now - this._nodeDefsCacheTime < ComfyApp.NODE_DEFS_CACHE_TTL
    ) {
      console.log(
        '[PerfOpt] /object_info returned cached defs (age:',
        Math.round((now - this._nodeDefsCacheTime) / 1000) + 's)'
      )
      return this._nodeDefsCache
    }

    // PerfOpt: Reuse prefetched /object_info response if available
    let resp: Response | null = null
    if (this._objectInfoPromise) {
      try {
        resp = await this._objectInfoPromise
        this._objectInfoPromise = null
        if (resp) {
          console.log('[PerfOpt] /object_info reused prefetched response')
        }
      } catch {
        this._objectInfoPromise = null
        console.warn(
          '[PerfOpt] Prefetch await failed, falling back to fresh request'
        )
      }
    }
    if (!resp) {
      // Fresh request with its own timeout protection
      resp = await api.fetchApi('/object_info')
    }
    // Skip batch translateNodeDef - i18n is applied on-demand at display time
    const defs = await resp.json()
    // Update cache
    this._nodeDefsCache = defs
    this._nodeDefsCacheTime = Date.now()
    return defs
  }

  /**
   * Registers nodes with the graph.
   * PerfOpt: Only stores defs + pre-registers a few high-frequency nodes.
   * Remaining nodes are registered on-demand (ensureNodesRegistered) or in background batches.
   */
  async registerNodes() {
    const defs = await this.getNodeDefs()
    await this.registerNodesFromDefs(defs)
    await useExtensionService().invokeExtensionsAsync('registerCustomNodes')

    // Pre-register a minimal set of high-frequency nodes needed for immediate use
    const eagerlyRegisteredNodeIds = [
      'PreviewImage',
      'SaveImage',
      'CLIPTextEncode',
      'CheckpointLoaderSimple',
      'KSampler'
    ]
    for (const nodeId of eagerlyRegisteredNodeIds) {
      const nodeDef = this._allNodeDefs.get(nodeId)
      if (!nodeDef) continue
      try {
        await this.registerNodeDef(nodeId, nodeDef)
      } catch (e) {
        console.error(`[LazyNodeReg] Failed to eagerly register ${nodeId}:`, e)
      }
    }

    if (this.vueAppReady) {
      this.updateVueAppNodeDefs(defs)
    }
  }

  async registerNodeDef(nodeId: string, nodeDef: ComfyNodeDefV1) {
    if (nodeId in LiteGraph.registered_node_types) {
      this._registeredNodeIds.add(nodeId)
      return
    }
    await useLitegraphService().registerNodeDef(nodeId, nodeDef)
    this._registeredNodeIds.add(nodeId)
  }

  async registerNodesFromDefs(defs: Record<string, ComfyNodeDefV1>) {
    await useExtensionService().invokeExtensionsAsync('addCustomNodeDefs', defs)
    // PerfOpt: Only store defs, do not register all nodes upfront
    for (const nodeId in defs) {
      this._allNodeDefs.set(nodeId, defs[nodeId])
    }
  }

  /**
   * Register specific node types on-demand. Skips already-registered nodes.
   * Called when loading a workflow (loadGraphData / loadApiJson).
   */
  async ensureNodesRegistered(nodeTypes: Iterable<string>) {
    const toRegister: string[] = []
    for (const nodeType of nodeTypes) {
      if (nodeType in LiteGraph.registered_node_types) {
        this._registeredNodeIds.add(nodeType)
      } else if (this._allNodeDefs.has(nodeType)) {
        toRegister.push(nodeType)
      }
    }
    if (toRegister.length === 0) return
    console.log(
      `[LazyNodeReg] On-demand registering ${toRegister.length} node types (${this._allNodeDefs.size} total defs)`
    )
    const startTime = performance.now()
    for (const nodeId of toRegister) {
      try {
        await this.registerNodeDef(nodeId, this._allNodeDefs.get(nodeId)!)
      } catch (e) {
        console.error(`[LazyNodeReg] Failed to register ${nodeId}:`, e)
      }
    }
    console.log(
      `[LazyNodeReg] On-demand registration took ${(performance.now() - startTime).toFixed(1)}ms`
    )
  }

  /**
   * Register remaining unregistered nodes in background batches
   * to avoid blocking the UI thread. Called after setup() is complete.
   */
  registerDeferredNodesInBackground() {
    if (this._backgroundRegistrationDone) return
    const BATCH_SIZE = 200
    const unregistered = [...this._allNodeDefs.keys()].filter(
      (id) => !(id in LiteGraph.registered_node_types)
    )
    if (unregistered.length === 0) {
      this._backgroundRegistrationDone = true
      return
    }
    let index = 0
    const registerBatch = () => {
      const batchEnd = Math.min(index + BATCH_SIZE, unregistered.length)
      while (index < batchEnd) {
        const nodeId = unregistered[index]
        if (
          !(nodeId in LiteGraph.registered_node_types) &&
          this._allNodeDefs.has(nodeId)
        ) {
          try {
            this.registerNodeDef(nodeId, this._allNodeDefs.get(nodeId)!)
          } catch (e) {
            console.error(
              `[LazyNodeReg] Background registration failed for ${nodeId}:`,
              e
            )
          }
        } else if (nodeId in LiteGraph.registered_node_types) {
          this._registeredNodeIds.add(nodeId)
        }
        index++
      }
      if (index < unregistered.length) {
        // Schedule next batch without blocking UI
        setTimeout(registerBatch, 0)
      } else {
        this._backgroundRegistrationDone = true
        console.log(
          `[LazyNodeReg] Background registration complete (${unregistered.length} nodes)`
        )
      }
    }
    // Start first batch on next tick
    setTimeout(registerBatch, 0)
  }

  loadTemplateData(templateData: {
    templates?: { name?: string; data?: string }[]
  }): void {
    if (!templateData?.templates) {
      return
    }

    const old = localStorage.getItem('litegrapheditor_clipboard')

    for (const template of templateData.templates) {
      if (!template?.data) {
        continue
      }

      // Check for old clipboard format
      const data = JSON.parse(template.data)
      if (!data.reroutes) {
        deserialiseAndCreate(template.data, app.canvas)
      } else {
        localStorage.setItem('litegrapheditor_clipboard', template.data)
        app.canvas.pasteFromClipboard()
      }

      // Move mouse position down to paste the next template below
      let maxY: number | undefined

      for (const i in app.canvas.selected_nodes) {
        const node = app.canvas.selected_nodes[i]
        const nodeBottom = node.pos[1] + node.size[1]
        if (maxY === undefined || nodeBottom > maxY) {
          maxY = nodeBottom
        }
      }

      if (maxY !== undefined) {
        app.canvas.graph_mouse[1] = maxY + 50
      }
    }

    if (old !== null) {
      localStorage.setItem('litegrapheditor_clipboard', old)
    }
  }

  private showMissingNodesError(missingNodeTypes: MissingNodeType[]) {
    if (useSettingStore().get('Comfy.Workflow.ShowMissingNodesWarning')) {
      useDialogService().showLoadWorkflowWarning({ missingNodeTypes })
    }
  }

  private showMissingModelsError(
    missingModels: ModelFile[],
    paths: Record<string, string[]>
  ): void {
    if (useSettingStore().get('Comfy.Workflow.ShowMissingModelsWarning')) {
      useDialogService().showMissingModelsWarning({
        missingModels,
        paths
      })
    }
  }

  async loadGraphData(
    graphData?: ComfyWorkflowJSON,
    clean: boolean = true,
    restore_view: boolean = true,
    workflow: string | null | ComfyWorkflow = null,
    options: {
      showMissingNodesDialog?: boolean
      showMissingModelsDialog?: boolean
      checkForRerouteMigration?: boolean
      openSource?: WorkflowOpenSource
    } = {}
  ) {
    const {
      showMissingNodesDialog = true,
      showMissingModelsDialog = true,
      checkForRerouteMigration = false,
      openSource
    } = options
    useWorkflowService().beforeLoadNewGraph()

    if (clean !== false) {
      this.clean()
    }

    let reset_invalid_values = false
    // Use explicit validation instead of falsy check to avoid replacing
    // valid but falsy values (empty objects, 0, false, etc.)
    if (
      !graphData ||
      typeof graphData !== 'object' ||
      Array.isArray(graphData)
    ) {
      graphData = defaultGraph
      reset_invalid_values = true
    }

    graphData = clone(graphData)

    if (useSettingStore().get('Comfy.Validation.Workflows')) {
      const { graphData: validatedGraphData } =
        await useWorkflowValidation().validateWorkflow(graphData)

      // If the validation failed, use the original graph data.
      // Ideally we should not block users from loading the workflow.
      graphData = validatedGraphData ?? graphData
    }
    // Only show the reroute migration warning if the workflow does not have native
    // reroutes. Merging reroute network has great complexity, and it is not supported
    // for now.
    // See: https://github.com/Comfy-Org/ComfyUI_frontend/issues/3317
    if (
      checkForRerouteMigration &&
      graphData.version === 0.4 &&
      findLegacyRerouteNodes(graphData).length &&
      noNativeReroutes(graphData)
    ) {
      useToastStore().add({
        group: 'reroute-migration',
        severity: 'warn'
      })
    }
    useSubgraphService().loadSubgraphs(graphData)

    // PerfOpt: Ensure nodes used in this workflow are registered before configuring
    if (graphData?.nodes) {
      const workflowNodeTypes = new Set<string>()
      const collectNodeTypes = (nodes: any[]) => {
        if (!Array.isArray(nodes)) return
        for (const n of nodes) {
          if (n.type) workflowNodeTypes.add(n.type)
        }
      }
      collectNodeTypes(graphData.nodes)
      if (graphData.definitions?.subgraphs) {
        for (const subgraph of graphData.definitions.subgraphs) {
          if (isSubgraphDefinition(subgraph)) {
            collectNodeTypes(subgraph.nodes)
          }
        }
      }
      if (workflowNodeTypes.size > 0) {
        await this.ensureNodesRegistered(workflowNodeTypes)
      }
    }

    const missingNodeTypes: MissingNodeType[] = []
    const missingModels: ModelFile[] = []
    await useExtensionService().invokeExtensionsAsync(
      'beforeConfigureGraph',
      graphData,
      missingNodeTypes
    )

    const embeddedModels: ModelFile[] = []

    const nodeReplacementStore = useNodeReplacementStore()

    const collectMissingNodesAndModels = (
      nodes: ComfyWorkflowJSON['nodes'],
      path: string = ''
    ) => {
      if (!Array.isArray(nodes)) {
        console.warn(
          'Workflow nodes data is missing or invalid, skipping node processing',
          { nodes, path }
        )
        return
      }
      for (let n of nodes) {
        // Find missing node types
        if (!(n.type in LiteGraph.registered_node_types)) {
          const replacement = nodeReplacementStore.getReplacementFor(n.type)

          missingNodeTypes.push({
            type: n.type,
            ...(path && { hint: `in subgraph '${path}'` }),
            isReplaceable: replacement !== null,
            replacement: replacement ?? undefined
          })

          n.type = sanitizeNodeName(n.type)
        }

        // Collect models metadata from node
        const selectedModels = getSelectedModelsMetadata(n)
        if (selectedModels?.length) {
          embeddedModels.push(...selectedModels)
        }
      }
    }

    // Process nodes at the top level
    collectMissingNodesAndModels(graphData.nodes)

    // Process nodes in subgraphs
    if (graphData.definitions?.subgraphs) {
      for (const subgraph of graphData.definitions.subgraphs) {
        if (isSubgraphDefinition(subgraph)) {
          collectMissingNodesAndModels(
            subgraph.nodes,
            subgraph.name || subgraph.id
          )
        }
      }
    }

    // Merge models from the workflow's root-level 'models' field
    const workflowSchemaV1Models = graphData.models
    if (workflowSchemaV1Models?.length)
      embeddedModels.push(...workflowSchemaV1Models)

    const getModelKey = (model: ModelFile) => model.url || model.hash
    const validModels = embeddedModels.filter(getModelKey)
    const uniqueModels = _.uniqBy(validModels, getModelKey)

    if (
      uniqueModels.length &&
      useSettingStore().get('Comfy.Workflow.ShowMissingModelsWarning')
    ) {
      const modelStore = useModelStore()
      await modelStore.loadModelFolders()
      for (const m of uniqueModels) {
        const modelFolder = await modelStore.getLoadedModelFolder(m.directory)
        if (!modelFolder)
          (m as ModelFile & { directory_invalid?: boolean }).directory_invalid =
            true

        const modelsAvailable = modelFolder?.models
        const modelExists =
          modelsAvailable &&
          Object.values(modelsAvailable).some(
            (model) => model.file_name === m.name
          )
        if (!modelExists) missingModels.push(m)
      }
    }

    try {
      // @ts-expect-error Discrepancies between zod and litegraph - in progress
      this.rootGraph.configure(graphData)

      // Save original renderer version before scaling (it gets modified during scaling)
      const originalMainGraphRenderer =
        this.rootGraph.extra.workflowRendererVersion

      // Scale main graph
      ensureCorrectLayoutScale(originalMainGraphRenderer)

      // Scale all subgraphs that were loaded with the workflow
      // Use original main graph renderer as fallback (not the modified one)
      for (const subgraph of this.rootGraph.subgraphs.values()) {
        ensureCorrectLayoutScale(
          subgraph.extra.workflowRendererVersion || originalMainGraphRenderer,
          subgraph
        )
      }

      if (
        restore_view &&
        useSettingStore().get('Comfy.EnableWorkflowViewRestore')
      ) {
        if (graphData.extra?.ds) {
          this.canvas.ds.offset = graphData.extra.ds.offset
          this.canvas.ds.scale = graphData.extra.ds.scale

          // Fit view if no nodes visible in restored viewport
          this.canvas.ds.computeVisibleArea(this.canvas.viewport)
          if (
            this.canvas.visible_area.width &&
            this.canvas.visible_area.height &&
            !anyItemOverlapsRect(
              this.rootGraph._nodes,
              this.canvas.visible_area
            )
          ) {
            requestAnimationFrame(() => useLitegraphService().fitView())
          }
        } else {
          useLitegraphService().fitView()
        }
      }
    } catch (error) {
      useDialogService().showErrorDialog(error, {
        title: t('errorDialog.loadWorkflowTitle'),
        reportType: 'loadWorkflowError'
      })
      console.error(error)
      return
    }
    forEachNode(this.rootGraph, (node) => {
      const size = node.computeSize()
      size[0] = Math.max(node.size[0], size[0])
      size[1] = Math.max(node.size[1], size[1])
      node.setSize(size)
      if (node.widgets) {
        // If you break something in the backend and want to patch workflows in the frontend
        // This is the place to do this
        for (let widget of node.widgets) {
          if (node.type == 'KSampler' || node.type == 'KSamplerAdvanced') {
            if (widget.name == 'sampler_name') {
              if (
                typeof widget.value === 'string' &&
                widget.value.startsWith('sample_')
              ) {
                widget.value = widget.value.slice(7)
              }
            }
          }
          if (
            node.type == 'KSampler' ||
            node.type == 'KSamplerAdvanced' ||
            node.type == 'PrimitiveNode'
          ) {
            if (widget.name == 'control_after_generate') {
              if (widget.value === true) {
                widget.value = 'randomize'
              } else if (widget.value === false) {
                widget.value = 'fixed'
              }
            }
          }
          if (reset_invalid_values) {
            if (widget.type == 'combo') {
              const values = widget.options.values as
                | (string | number | boolean)[]
                | undefined
              if (
                values &&
                values.length > 0 &&
                !values.includes(widget.value as string | number | boolean)
              ) {
                widget.value = values[0]
              }
            }
          }
        }
      }

      useExtensionService().invokeExtensions('loadedGraphNode', node)
    })

    if (missingNodeTypes.length && showMissingNodesDialog) {
      this.showMissingNodesError(missingNodeTypes)
    }
    if (missingModels.length && showMissingModelsDialog) {
      const paths = await api.getFolderPaths()
      this.showMissingModelsError(missingModels, paths)
    }
    await useExtensionService().invokeExtensionsAsync(
      'afterConfigureGraph',
      missingNodeTypes
    )

    const telemetryPayload = {
      missing_node_count: missingNodeTypes.length,
      missing_node_types: missingNodeTypes.map((node) =>
        typeof node === 'string' ? node : node.type
      ),
      open_source: openSource ?? 'unknown'
    }
    useTelemetry()?.trackWorkflowOpened(telemetryPayload)
    useTelemetry()?.trackWorkflowImported(telemetryPayload)
    await useWorkflowService().afterLoadNewGraph(
      workflow,
      this.rootGraph.serialize() as unknown as ComfyWorkflowJSON
    )
    requestAnimationFrame(() => {
      this.canvas.setDirty(true, true)
    })
  }

  async graphToPrompt(graph = this.rootGraph) {
    return graphToPrompt(graph, {
      sortNodes: useSettingStore().get('Comfy.Workflow.SortNodeIdOnSave')
    })
  }

  async queuePrompt(
    number: number,
    batchCount: number = 1,
    queueNodeIds?: NodeExecutionId[]
  ): Promise<boolean> {
    this.queueItems.push({ number, batchCount, queueNodeIds })

    // Only have one action process the items so each one gets a unique seed correctly
    if (this.processingQueue) {
      return false
    }

    this.processingQueue = true
    const executionStore = useExecutionStore()
    executionStore.lastNodeErrors = null

    // Get auth token for backend nodes - uses workspace token if enabled, otherwise Firebase token

    try {
      while (this.queueItems.length) {
        const { number, batchCount, queueNodeIds } = this.queueItems.pop()!
        const previewMethod = useSettingStore().get(
          'Comfy.Execution.PreviewMethod'
        )

        const isPartialExecution = !!queueNodeIds?.length
        for (let i = 0; i < batchCount; i++) {
          // Allow widgets to run callbacks before a prompt has been queued
          // e.g. random seed before every gen
          forEachNode(this.rootGraph, (node) => {
            for (const widget of node.widgets ?? []) {
              widget.beforeQueued?.({ isPartialExecution })
            }
          })

          const p = await this.graphToPrompt(this.rootGraph)
          const queuedNodes = collectAllNodes(this.rootGraph)
          try {
            // Auth tokens removed - not needed for localhost deployment
            const res = await api.queuePrompt(number, p, {
              partialExecutionTargets: queueNodeIds,
              previewMethod
            })
            // Auth tokens removed
            executionStore.lastNodeErrors = res.node_errors ?? null
            if (executionStore.lastNodeErrors?.length) {
              this.canvas.draw(true, true)
            } else {
              try {
                if (res.prompt_id) {
                  executionStore.storePrompt({
                    id: res.prompt_id,
                    nodes: Object.keys(p.output),
                    workflow: useWorkspaceStore().workflow
                      .activeWorkflow as ComfyWorkflow
                  })
                }
              } catch (error) {}
            }
          } catch (error: unknown) {
            if (
              error instanceof PromptExecutionError &&
              typeof error.response.error === 'object' &&
              error.response.error?.type === 'missing_node_type'
            ) {
              const extraInfo = (error.response.error.extra_info ??
                {}) as MissingNodeTypeExtraInfo
              const missingNodeType = createMissingNodeTypeFromError(extraInfo)
              this.showMissingNodesError([missingNodeType])
            } else {
              useDialogService().showErrorDialog(error, {
                title: t('errorDialog.promptExecutionError'),
                reportType: 'promptExecutionError'
              })
            }
            console.error(error)

            if (error instanceof PromptExecutionError) {
              executionStore.lastNodeErrors = error.response.node_errors ?? null
              this.canvas.draw(true, true)
            }
            break
          }

          // Allow widgets to run callbacks after a prompt has been queued
          // e.g. random seed after every gen
          executeWidgetsCallback(queuedNodes, 'afterQueued', {
            isPartialExecution
          })
          this.canvas.draw(true, true)
          await this.ui.queue.update()
        }
      }
    } finally {
      this.processingQueue = false
    }
    api.dispatchCustomEvent('promptQueued', { number, batchCount })
    return !executionStore.lastNodeErrors
  }

  showErrorOnFileLoad(file: File) {
    useToastStore().addAlert(
      t('toastMessages.fileLoadError', { fileName: file.name })
    )
  }

  /**
   * Loads workflow data from the specified file
   * @param {File} file
   */
  async handleFile(file: File, openSource?: WorkflowOpenSource) {
    const fileName = file.name.replace(/\.\w+$/, '') // Strip file extension
    const workflowData = await getWorkflowDataFromFile(file)
    if (_.isEmpty(workflowData)) {
      if (file.type.startsWith('image')) {
        const transfer = new DataTransfer()
        transfer.items.add(file)
        pasteImageNode(this.canvas, transfer.items)
        return
      }

      this.showErrorOnFileLoad(file)
      return
    }

    const { workflow, prompt, parameters, templates } = workflowData

    if (
      templates &&
      typeof templates === 'object' &&
      Array.isArray(templates)
    ) {
      this.loadTemplateData({
        templates: templates as { name?: string; data?: string }[]
      })
    }

    // Check workflow first - it should take priority over parameters
    // when both are present (e.g., in ComfyUI-generated PNGs)
    if (workflow) {
      let workflowObj: ComfyWorkflowJSON | undefined = undefined
      try {
        workflowObj =
          typeof workflow === 'string' ? JSON.parse(workflow) : workflow

        // Only load workflow if parsing succeeded AND validation passed
        if (
          workflowObj &&
          typeof workflowObj === 'object' &&
          !Array.isArray(workflowObj)
        ) {
          await this.loadGraphData(workflowObj, true, true, fileName, {
            openSource
          })
          return
        } else {
          console.error(
            'Invalid workflow structure, trying parameters fallback'
          )
          this.showErrorOnFileLoad(file)
        }
      } catch (err) {
        console.error('Failed to parse workflow:', err)
        this.showErrorOnFileLoad(file)
        // Fall through to check parameters as fallback
      }
    }

    if (prompt) {
      try {
        const promptObj =
          typeof prompt === 'string' ? JSON.parse(prompt) : prompt
        if (this.isApiJson(promptObj)) {
          await this.loadApiJson(promptObj, fileName)
          return
        }
      } catch (err) {
        console.error('Failed to parse prompt:', err)
      }
      // Fall through to parameters as a last resort
    }

    // Use parameters strictly as the final fallback
    if (parameters && typeof parameters === 'string') {
      useWorkflowService().beforeLoadNewGraph()
      importA1111(this.rootGraph, parameters)
      useWorkflowService().afterLoadNewGraph(
        fileName,
        this.rootGraph.serialize() as unknown as ComfyWorkflowJSON
      )
      return
    }

    this.showErrorOnFileLoad(file)
  }

  // @deprecated
  isApiJson(data: unknown): data is ComfyApiWorkflow {
    if (!_.isObject(data) || Array.isArray(data)) {
      return false
    }
    if (Object.keys(data).length === 0) return false

    return Object.values(data).every((node) => {
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        return false
      }

      const { class_type: classType, inputs } = node as Record<string, unknown>
      const inputsIsRecord = _.isObject(inputs) && !Array.isArray(inputs)
      return typeof classType === 'string' && inputsIsRecord
    })
  }

  async loadApiJson(apiData: ComfyApiWorkflow, fileName: string) {
    useWorkflowService().beforeLoadNewGraph()

    // PerfOpt: Ensure all node types used in the API workflow are registered
    const apiNodeTypes = new Set(
      Object.values(apiData).map((n) => n.class_type)
    )
    await this.ensureNodesRegistered(apiNodeTypes)

    const missingNodeTypes = Object.values(apiData).filter(
      (n) => !LiteGraph.registered_node_types[n.class_type]
    )
    if (missingNodeTypes.length) {
      this.showMissingNodesError(missingNodeTypes.map((t) => t.class_type))
      return
    }

    const ids = Object.keys(apiData)
    app.rootGraph.clear()
    for (const id of ids) {
      const data = apiData[id]
      const node = LiteGraph.createNode(data.class_type)
      if (!node) continue
      node.id = isNaN(+id) ? id : +id
      node.title = data._meta?.title ?? node.title
      app.rootGraph.add(node)
    }

    const processNodeInputs = (id: string) => {
      const data = apiData[id]
      const node = app.rootGraph.getNodeById(id)
      if (!node) return

      for (const input in data.inputs ?? {}) {
        const value = data.inputs[input]
        if (value instanceof Array) {
          const [fromId, fromSlot] = value
          const fromNode = app.rootGraph.getNodeById(fromId)
          if (!fromNode) continue

          let toSlot = node.inputs?.findIndex((inp) => inp.name === input) ?? -1
          if (toSlot === -1) {
            try {
              const widget = node.widgets?.find((w) => w.name === input)
              const convertFn = (
                node as LGraphNode & {
                  convertWidgetToInput?: (w: IBaseWidget) => boolean
                }
              ).convertWidgetToInput
              if (widget && convertFn?.(widget)) {
                // Re-find the target slot by name after conversion
                toSlot =
                  node.inputs?.findIndex((inp) => inp.name === input) ?? -1
              }
            } catch (_error) {
              // Ignore conversion errors
            }
          }
          if (toSlot !== -1) {
            fromNode.connect(fromSlot, node, toSlot)
          }
        } else {
          const widget = node.widgets?.find((w) => w.name === input)
          if (widget) {
            widget.value = value
            widget.callback?.(value)
          }
        }
      }
    }

    for (const id of ids) processNodeInputs(id)
    app.rootGraph.arrange()
    for (const id of ids) processNodeInputs(id)
    app.rootGraph.arrange()

    useWorkflowService().afterLoadNewGraph(
      fileName,
      this.rootGraph.serialize() as unknown as ComfyWorkflowJSON
    )
  }

  /**
   * Registers a Comfy web extension with the app
   * @param {ComfyExtension} extension
   */
  registerExtension(extension: ComfyExtension) {
    useExtensionService().registerExtension(extension)
  }

  /**
   * Collects context menu items from all extensions for canvas menus
   * @param canvas The canvas instance
   * @returns Array of context menu items from all extensions
   */
  collectCanvasMenuItems(canvas: LGraphCanvas): IContextMenuValue[] {
    return useExtensionService()
      .invokeExtensions('getCanvasMenuItems', canvas)
      .flat() as IContextMenuValue[]
  }

  /**
   * Collects context menu items from all extensions for node menus
   * @param node The node being right-clicked
   * @returns Array of context menu items from all extensions
   */
  collectNodeMenuItems(node: LGraphNode): IContextMenuValue[] {
    return useExtensionService()
      .invokeExtensions('getNodeMenuItems', node)
      .flat() as IContextMenuValue[]
  }

  /**
   * Refresh combo list on whole nodes
   */
  async refreshComboInNodes({
    showToast = true
  }: { showToast?: boolean } = {}) {
    const requestToastMessage: ToastMessageOptions = {
      severity: 'info',
      summary: t('g.update'),
      detail: t('toastMessages.updateRequested')
    }
    if (showToast && this.vueAppReady) {
      useToastStore().add(requestToastMessage)
    }

    const defs = await this.getNodeDefs(true) // forceRefresh=true for manual refresh
    // Update stored defs and register any new nodes
    for (const nodeId in defs) {
      this._allNodeDefs.set(nodeId, defs[nodeId])
    }
    // Refresh combo widgets in all nodes including those in subgraphs
    forEachNode(this.rootGraph, (node) => {
      const def = defs[node.type]
      // Allow primitive nodes to handle refresh
      node.refreshComboInNode?.(defs)

      if (!def?.input) return

      if (node.widgets) {
        const nodeInputs = def.input
        for (const widget of node.widgets) {
          if (widget.type === 'combo') {
            let inputType: 'required' | 'optional' | undefined
            if (nodeInputs.required?.[widget.name] !== undefined) {
              inputType = 'required'
            } else if (nodeInputs.optional?.[widget.name] !== undefined) {
              inputType = 'optional'
            }
            if (inputType !== undefined) {
              // Get the input spec associated with the widget
              const inputSpec = nodeInputs[inputType]?.[widget.name]
              if (inputSpec) {
                // Refresh the combo widget's options with the values from the input spec
                if (isComboInputSpecV2(inputSpec)) {
                  widget.options.values = inputSpec[1]?.options
                } else if (isComboInputSpecV1(inputSpec)) {
                  widget.options.values = inputSpec[0]
                }
              }
            }
          }
        }
      }
    })

    await useExtensionService().invokeExtensionsAsync(
      'refreshComboInNodes',
      defs
    )

    if (this.vueAppReady) {
      this.updateVueAppNodeDefs(defs)
      if (showToast) {
        useToastStore().remove(requestToastMessage)
        useToastStore().add({
          severity: 'success',
          summary: t('g.updated'),
          detail: t('toastMessages.nodeDefinitionsUpdated'),
          life: 1000
        })
      }
    }
  }

  /**
   * Clean current state
   */
  clean() {
    const nodeOutputStore = useNodeOutputStore()
    nodeOutputStore.resetAllOutputsAndPreviews()
    const executionStore = useExecutionStore()
    executionStore.lastNodeErrors = null
    executionStore.lastExecutionError = null

    useDomWidgetStore().clear()

    // Subgraph does not properly implement `clear` and the parent class's
    // (`LGraph`) `clear` breaks the subgraph structure.
    if (this.rootGraph && !this.canvas.subgraph) {
      this.rootGraph.clear()
    }
  }

  clientPosToCanvasPos(pos: Vector2): Vector2 {
    if (!this.positionConversion) {
      throw new Error('clientPosToCanvasPos called before setup')
    }
    return this.positionConversion.clientPosToCanvasPos(pos)
  }

  canvasPosToClientPos(pos: Vector2): Vector2 {
    if (!this.positionConversion) {
      throw new Error('canvasPosToClientPos called before setup')
    }
    return this.positionConversion.canvasPosToClientPos(pos)
  }
}

export const app = new ComfyApp()
