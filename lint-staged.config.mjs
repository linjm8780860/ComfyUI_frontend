import path from 'node:path'

/** @type {import('lint-staged').Configuration} */
const config = {
  'tests-ui/**': () =>
    'echo "Files in tests-ui/ are deprecated. Colocate tests with source files." && exit 1',

  './**/*.js': (stagedFiles) => formatAndEslint(stagedFiles),

  './**/*.{ts,tsx,vue,mts}': (stagedFiles) => [
    ...formatAndEslint(stagedFiles),
    'pnpm typecheck'
  ]
}

export default config

/**
 * @param {string[]} fileNames
 */
function formatAndEslint(fileNames) {
  // Convert absolute paths to relative paths for better ESLint resolution
  const relativePaths = fileNames.map((f) => path.relative(process.cwd(), f))
  const joinedPaths = relativePaths.map((p) => `"${p}"`).join(' ')
  return [
    `pnpm exec oxfmt --write ${joinedPaths}`,
    `pnpm exec oxlint --fix ${joinedPaths}`,
    `pnpm exec eslint --cache --fix --no-warn-ignored ${joinedPaths}`
  ]
}
