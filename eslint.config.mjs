import js from '@eslint/js';
import globals from 'globals';

const lintTargets = [
  'src/client/app/**/*.js',
  'src/server/app/**/*.js',
  'src/server/platform/**/*.js',
  'src/server/observability/**/*.js',
  'src/server/transport/protocol/**/*.js',
  'src/core/shared/protocol/**/*.js',
  'tools/dev/**/*.js',
  'tools/test/**/*.js',
  'vite.config.mjs',
  'vitest.config.mjs',
  'dependency-cruiser.cjs',
];

export default [
  {
    ignores: [
      'node_modules/**',
      'release/**',
      'genius-invokation-main/**',
      'avatars_scratch/**',
      'build/**',
      'tmp/**',
    ],
  },
  js.configs.recommended,
  {
    files: lintTargets,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: [
      'src/server/**/*.js',
      'tools/**/*.js',
      'dependency-cruiser.cjs',
    ],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
];
