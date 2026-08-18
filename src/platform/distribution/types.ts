/**
 * Distribution types and compile-time constants for managing
 * multi-distribution builds (Desktop, Localhost)
 */

type Distribution = 'desktop' | 'localhost'

declare global {
  const __DISTRIBUTION__: Distribution
  const __IS_NIGHTLY__: boolean
}

/** Current distribution - replaced at compile time */
const DISTRIBUTION: Distribution = __DISTRIBUTION__

export const isDesktop = DISTRIBUTION === 'desktop'

/** Cloud distribution is not supported in this build. Tree-shaking will eliminate dead code. */
export const isCloud = false as const

/**
 * Whether this is a nightly build (from main branch).
 * Nightly builds may show experimental features and surveys.
 * @public
 */
export const isNightly = __IS_NIGHTLY__
