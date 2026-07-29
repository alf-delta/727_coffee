import { defineConfig } from 'vite';
import { devApiPlugin } from './dev/devApiPlugin.js';

export default defineConfig({
  plugins: [devApiPlugin()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 4096,
  },
});
