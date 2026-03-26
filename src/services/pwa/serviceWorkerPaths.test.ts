import { describe, expect, it } from 'vitest'

import {
  getServiceWorkerScopePath,
  getServiceWorkerUrl,
  isBypassedServiceWorkerPath,
  isManagedFrontendAssetUrl,
  isManagedStaticAssetPath,
  isManagedStaticDataPath,
  normalizeScopePath,
  shouldActivateWaitingServiceWorker,
  stripScopePath
} from '@/services/pwa/serviceWorkerPaths'

describe('serviceWorkerPaths', () => {
  it('normalizes scope paths for root and subpath deployments', () => {
    expect(normalizeScopePath('/')).toBe('/')
    expect(normalizeScopePath('/ComfyUI')).toBe('/ComfyUI/')
    expect(normalizeScopePath('ComfyUI')).toBe('/ComfyUI/')
  })

  it('strips the deployment scope from routed paths', () => {
    expect(stripScopePath('/ComfyUI/assets/app.js', '/ComfyUI/')).toBe(
      '/assets/app.js'
    )
    expect(stripScopePath('/assets/app.js', '/')).toBe('/assets/app.js')
  })

  it('marks api-style endpoints as bypassed', () => {
    expect(isBypassedServiceWorkerPath('/ComfyUI/api/queue', '/ComfyUI/')).toBe(
      true
    )
    expect(
      isBypassedServiceWorkerPath('/ComfyUI/workflow_templates/foo.json', '/ComfyUI/')
    ).toBe(true)
    expect(isBypassedServiceWorkerPath('/ComfyUI/assets/app.js', '/ComfyUI/')).toBe(
      false
    )
  })

  it('classifies same-origin core frontend assets under a subpath', () => {
    expect(isManagedStaticAssetPath('/ComfyUI/assets/app-abcd1234.js', '/ComfyUI/')).toBe(
      true
    )
    expect(isManagedStaticAssetPath('/ComfyUI/materialdesignicons.min.css', '/ComfyUI/')).toBe(
      true
    )
    expect(isManagedStaticAssetPath('/ComfyUI/fonts/materialdesignicons-webfont.woff2', '/ComfyUI/')).toBe(
      true
    )
    expect(isManagedStaticAssetPath('/ComfyUI/assets/sorted-custom-node-map.json', '/ComfyUI/')).toBe(
      false
    )
    expect(isManagedStaticAssetPath('/ComfyUI/extensions/foo.js', '/ComfyUI/')).toBe(
      false
    )
  })

  it('classifies managed JSON data separately from hashed assets', () => {
    expect(
      isManagedStaticDataPath('/ComfyUI/assets/sorted-custom-node-map.json', '/ComfyUI/')
    ).toBe(true)
    expect(
      isManagedStaticDataPath('/ComfyUI/templates/index_logo.json', '/ComfyUI/')
    ).toBe(true)
    expect(
      isManagedStaticDataPath('/ComfyUI/templates/example.json', '/ComfyUI/')
    ).toBe(true)
    expect(isManagedStaticDataPath('/ComfyUI/assets/app.js', '/ComfyUI/')).toBe(
      false
    )
  })

  it('only flags same-origin managed assets for stale-chunk recovery', () => {
    expect(
      isManagedFrontendAssetUrl(
        'https://example.com/ComfyUI/assets/app.js',
        'https://example.com',
        '/ComfyUI/'
      )
    ).toBe(true)
    expect(
      isManagedFrontendAssetUrl(
        'https://cdn.example.com/assets/app.js',
        'https://example.com',
        '/ComfyUI/'
      )
    ).toBe(false)
  })

  it('derives the service worker url and scope from the bundled entry url', () => {
    const importMetaUrl =
      'https://example.com/ComfyUI/assets/index-abc123.js'

    expect(getServiceWorkerUrl(importMetaUrl).href).toBe(
      'https://example.com/ComfyUI/service-worker.js'
    )
    expect(getServiceWorkerScopePath(importMetaUrl)).toBe('/ComfyUI/')
  })

  it('only auto-activates waiting workers when execution is idle', () => {
    expect(shouldActivateWaitingServiceWorker(true, 0)).toBe(true)
    expect(shouldActivateWaitingServiceWorker(false, 0)).toBe(false)
    expect(shouldActivateWaitingServiceWorker(true, 2)).toBe(false)
  })
})
