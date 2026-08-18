import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [
        '{build,scripts}/**/*.{js,ts}',
        'src/assets/css/style.css',
        'src/main.ts',
        'src/scripts/ui/menu/index.ts',
        'src/types/index.ts',
        'src/storybook/mocks/**/*.ts'
      ],
      project: ['**/*.{js,ts,vue}', '*.{js,ts,mts}']
    },
    'apps/desktop-ui': {
      entry: ['src/main.ts', 'src/i18n.ts'],
      project: ['src/**/*.{js,ts,vue}']
    },
    'packages/tailwind-utils': {
      project: ['src/**/*.{js,ts}']
    },
    'packages/registry-types': {
      project: ['src/**/*.{js,ts}']
    }
  },
  ignoreBinaries: ['python3', 'gh'],
  ignoreDependencies: [
    // Weird importmap things
    '@iconify-json/lucide',
    '@iconify/json',
    '@primeuix/forms',
    '@primeuix/styled',
    '@primeuix/utils',
    '@primevue/icons',
    '@sentry/vite-plugin',
    'firebase',
    'mixpanel-browser',
    'vuefire'
  ],
  ignore: [
    // Auto generated manager types
    'src/workbench/extensions/manager/types/generatedManagerTypes.ts',
    'packages/registry-types/src/comfyRegistryTypes.ts',
    // Used by a custom node (that should move off of this)
    'src/scripts/ui/components/splitButton.ts',
    // BizyAir keeps these modules for compatibility while their UI entry
    // points are disabled.
    'src/components/dialog/content/ApiNodesSignInContent.vue',
    'src/components/dialog/content/SignInContent.vue',
    'src/components/dialog/content/signin/{PasswordFields,SignUpForm}.vue',
    'src/components/helpcenter/**',
    'src/components/icons/{ComfyLogo,PuzzleIcon}.vue',
    'src/components/sidebar/{ComfyMenuButton,SidebarBottomPanelToggleButton,SidebarHelpCenterIcon,SidebarLogoutIcon,SidebarSettingsButton,SidebarShortcutsToggleButton}.vue',
    'src/components/topbar/{CurrentUserPopoverWorkspace,WorkspaceSwitcherPopover}.vue',
    'src/composables/billing/{types,useLegacyBilling,useWorkspaceBilling}.ts',
    'src/config/firebase.ts',
    'src/extensions/core/{cloudBadges,cloudFeedbackTopbarButton,cloudRemoteConfig,cloudSessionCookie,cloudSubscription,nightlyBadges}.ts',
    'src/platform/auth/**',
    'src/platform/cloud/**',
    'src/platform/settings/localeStore.ts',
    'src/platform/support/config.ts',
    'src/platform/telemetry/**',
    'src/platform/workflow/templates/types/template.ts',
    'src/platform/workspace/api/workspaceApi.ts',
    'src/platform/workspace/stores/teamWorkspaceStore.ts',
    'src/schemas/signInSchema.ts',
    'src/stores/{apiKeyAuthStore,firebaseAuthStore,workspaceAuthStore}.ts',
    'src/types/authTypes.ts',
    'src/utils/graphTraversalUtil.ts'
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
