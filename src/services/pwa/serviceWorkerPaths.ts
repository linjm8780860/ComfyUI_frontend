const STATIC_ASSET_EXTENSIONS = new Set([
  'avif',
  'css',
  'eot',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'js',
  'mjs',
  'otf',
  'png',
  'svg',
  'ttf',
  'wasm',
  'webp',
  'woff',
  'woff2'
])

const BYPASSED_PATH_PREFIXES = [
  '/api',
  '/docs',
  '/extensions',
  '/internal',
  '/workflow_templates'
]

export function normalizeScopePath(scopePath: string): string {
  if (!scopePath || scopePath === '/') return '/'

  const withLeadingSlash = scopePath.startsWith('/')
    ? scopePath
    : `/${scopePath}`

  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash
    : `${withLeadingSlash}/`
}

export function stripScopePath(pathname: string, scopePath: string): string {
  const normalizedScope = normalizeScopePath(scopePath)

  if (normalizedScope === '/') return pathname
  if (!pathname.startsWith(normalizedScope)) return pathname

  const relativePath = pathname.slice(normalizedScope.length)
  return relativePath ? `/${relativePath}` : '/'
}

function getRelativePath(pathname: string, scopePath: string): string {
  return stripScopePath(pathname, scopePath)
}

function getExtension(pathname: string): string | undefined {
  const filename = pathname.split('/').pop()
  if (!filename || !filename.includes('.')) return
  return filename.split('.').pop()?.toLowerCase()
}

export function getServiceWorkerUrl(importMetaUrl: string): URL {
  return new URL('../service-worker.js', importMetaUrl)
}

export function getServiceWorkerScopePath(importMetaUrl: string): string {
  return normalizeScopePath(new URL('./', getServiceWorkerUrl(importMetaUrl)).pathname)
}

export function isBypassedServiceWorkerPath(
  pathname: string,
  scopePath: string
): boolean {
  const relativePath = getRelativePath(pathname, scopePath)

  if (relativePath === '/ws' || relativePath.startsWith('/ws/')) return true

  return BYPASSED_PATH_PREFIXES.some(
    (prefix) =>
      relativePath === prefix || relativePath.startsWith(`${prefix}/`)
  )
}

export function isManagedStaticDataPath(
  pathname: string,
  scopePath: string
): boolean {
  if (isBypassedServiceWorkerPath(pathname, scopePath)) return false

  const relativePath = getRelativePath(pathname, scopePath)

  if (relativePath === '/assets/sorted-custom-node-map.json') return true
  if (relativePath === '/manifest.json') return true

  return relativePath.startsWith('/templates/') && relativePath.endsWith('.json')
}

export function isManagedStaticAssetPath(
  pathname: string,
  scopePath: string
): boolean {
  if (isBypassedServiceWorkerPath(pathname, scopePath)) return false

  const relativePath = getRelativePath(pathname, scopePath)

  if (relativePath === '/materialdesignicons.min.css') return true
  if (relativePath.startsWith('/fonts/')) return true

  if (!relativePath.startsWith('/assets/')) return false

  const extension = getExtension(relativePath)
  return !!extension && STATIC_ASSET_EXTENSIONS.has(extension)
}

export function isManagedFrontendAssetUrl(
  rawUrl: string,
  appOrigin: string,
  scopePath: string
): boolean {
  try {
    const url = new URL(rawUrl, appOrigin)
    return (
      url.origin === appOrigin &&
      isManagedStaticAssetPath(url.pathname, scopePath)
    )
  } catch {
    return false
  }
}

export function shouldActivateWaitingServiceWorker(
  isExecutionIdle: boolean,
  activeJobsCount: number
): boolean {
  return isExecutionIdle && activeJobsCount === 0
}
