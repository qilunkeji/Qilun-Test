import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Same-origin deployment: dev server proxies /api and /mcp to the local backend,
// production build is served by the backend/nginx exactly like the legacy SPA.
export default defineConfig({
  root: '.',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 3222, proxy: { '/api': 'http://127.0.0.1:43131', '/mcp': 'http://127.0.0.1:43131' } },
  plugins: [vue()],
});
