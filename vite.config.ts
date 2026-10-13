import { defineConfig } from 'vite';
// Legacy admin-web build config; the SSR tests in tests/h5-render.test.ts
// create a vite server rooted at apps/admin-web and need JSX/React handling.
export default defineConfig({ root: 'apps/admin-web', build: { outDir: '../../dist/admin-web' } });
