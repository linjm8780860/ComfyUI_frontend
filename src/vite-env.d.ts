/// <reference types="vite/client" />

declare module 'virtual:icons/*' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}

declare module '~icons/*' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}

declare global {
  const __COMFYUI_SW_CACHE_VERSION__: string

  interface Window {
    __COMFYUI_FRONTEND_VERSION__: string
  }

  interface ImportMetaEnv {
    VITE_APP_VERSION?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

export {}
