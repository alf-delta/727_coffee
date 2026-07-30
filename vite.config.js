import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { devApiPlugin } from './dev/devApiPlugin.js';

export default defineConfig({
  plugins: [devApiPlugin()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        checker: resolve(import.meta.dirname, 'checker/index.html'),
      },
    },
  },
});
