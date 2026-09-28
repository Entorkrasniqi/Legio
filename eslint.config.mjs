import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'release/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // CLAUDE.md: no `any` without a comment explaining why — so any use must
      // come with an explicit eslint-disable line carrying that reason.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/main/**/*.ts', 'tests/**/*.ts', '*.config.ts', '*.config.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The renderer has no Node access (docs/ARCHITECTURE.md). Make an
      // accidental import fail lint rather than fail at runtime.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'node:*'],
              message: 'Renderer code must not import Electron or Node modules — go through window.legio.',
            },
            {
              group: ['**/main/**'],
              message: 'Renderer code must not import from src/main — shared code belongs in src/shared.',
            },
          ],
          paths: ['fs', 'path', 'child_process', 'os', 'crypto', 'better-sqlite3', '@anthropic-ai/sdk'],
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'node:*'],
              message: 'src/shared is imported by the renderer and preload; keep it runtime-neutral.',
            },
            {
              group: ['**/main/**', '**/renderer/**'],
              message: 'src/shared must not depend on main or renderer.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
