import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [
        '{build,scripts}/**/*.{js,ts}',
        'src/assets/css/style.css',
        'src/service-worker.js',
        'src/scripts/ui/menu/index.ts',
        'src/types/index.ts',
        'src/storybook/mocks/**/*.ts'
      ],
      project: [
        '**/*.{js,ts,vue}',
        '*.{js,ts,mts}',
        '!apps/**',
        '!packages/**',
        '!comfyui_frontend_package/comfyui_frontend_package/static/**'
      ]
    },
    'apps/desktop-ui': {
      entry: ['src/i18n.ts'],
      project: ['src/**/*.{js,ts,vue}']
    },
    'packages/tailwind-utils': {
      project: ['src/**/*.{js,ts}']
    },
    'packages/registry-types': {
      project: ['src/**/*.{js,ts}']
    }
  },
  ignoreBinaries: ['python3'],
  ignoreDependencies: [
    // Weird importmap things
    '@iconify-json/lucide',
    '@iconify/json',
    '@primeuix/forms',
    '@primeuix/styled',
    '@primeuix/utils',
    '@primevue/icons'
  ],
  ignore: [
    // Auto generated manager types
    'src/workbench/extensions/manager/types/generatedManagerTypes.ts'
  ],
  compilers: {
    // https://github.com/webpro-nl/knip/issues/1008#issuecomment-3207756199
    css: (text: string) =>
      [...text.replaceAll('plugin', 'import').matchAll(/(?<=@)import[^;]+/g)]
        .map((match) => match[0].replace(/url\(['"]?([^'"()]+)['"]?\)/, '$1'))
        .join('\n')
  },
  vite: {
    config: ['vite?(.*).config.mts']
  },
  vitest: {
    config: ['vitest?(.*).config.ts'],
    entry: [
      '**/*.{bench,test,test-d,spec}.?(c|m)[jt]s?(x)',
      '**/__mocks__/**/*.[jt]s?(x)'
    ]
  },
  playwright: {
    config: ['playwright?(.*).config.ts'],
    entry: ['**/*.@(spec|test).?(c|m)[jt]s?(x)', 'browser_tests/**/*.ts']
  },
  tags: [
    '-knipIgnoreUnusedButUsedByCustomNodes',
    '-knipIgnoreUnusedButUsedByVueNodesBranch'
  ]
}

export default config
