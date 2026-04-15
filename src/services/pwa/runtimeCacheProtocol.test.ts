import {
  getRuntimeCacheName,
  getRuntimeCacheNames,
  isOutdatedRuntimeCacheName,
  normalizeRuntimeCacheGroups
} from './runtimeCacheProtocol'

describe('runtimeCacheProtocol', () => {
  beforeEach(() => {
    vi.stubGlobal('__COMFYUI_SW_CACHE_VERSION__', 'test-cache-version')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds versioned runtime cache names', () => {
    expect(getRuntimeCacheName('static')).toBe(
      'comfyui-frontend-static-test-cache-version'
    )
    expect(getRuntimeCacheNames()).toEqual([
      'comfyui-frontend-pages-test-cache-version',
      'comfyui-frontend-static-test-cache-version',
      'comfyui-frontend-data-test-cache-version'
    ])
  })

  it('normalizes requested purge groups', () => {
    expect(normalizeRuntimeCacheGroups(['static', 'data'])).toEqual([
      'static',
      'data'
    ])
    expect(normalizeRuntimeCacheGroups(['invalid'])).toEqual([
      'pages',
      'static',
      'data'
    ])
    expect(normalizeRuntimeCacheGroups()).toEqual(['pages', 'static', 'data'])
  })

  it('detects outdated runtime caches', () => {
    expect(
      isOutdatedRuntimeCacheName('comfyui-frontend-static-old-version')
    ).toBe(true)
    expect(
      isOutdatedRuntimeCacheName('comfyui-frontend-static-test-cache-version')
    ).toBe(false)
    expect(isOutdatedRuntimeCacheName('workbox-precache-v2-123')).toBe(false)
  })
})
