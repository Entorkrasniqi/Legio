import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { APP_NAME } from './src/shared/constants';
import { buildCsp } from './src/main/security/csp';

/** Fills the %CSP% / %APP_NAME% placeholders in index.html from one source. */
function htmlPlaceholders(): Plugin {
  let mode: 'production' | 'development' = 'production';
  return {
    name: 'legio-html-placeholders',
    configResolved(config) {
      mode = config.command === 'serve' ? 'development' : 'production';
    },
    transformIndexHtml(html) {
      return html.replaceAll('%CSP%', buildCsp(mode)).replaceAll('%APP_NAME%', APP_NAME);
    },
  };
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        // Sandboxed preloads must be a single CommonJS file.
        input: { index: resolve(__dirname, 'src/main/preload.ts') },
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
    plugins: [react(), htmlPlaceholders()],
  },
});
