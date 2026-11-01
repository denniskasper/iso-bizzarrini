import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * **Development says it is Development.** Only `vite dev` runs this, on a developer's own machine:
 * the page it serves is marked so, and wears its own band. A built app is served by the API,
 * which marks it Production or not, and a practice system it serves is Integration.
 */
function markDevelopment(): Plugin {
  return {
    name: 'ricambi-mark-development',
    apply: 'serve',
    transformIndexHtml: (html) =>
      html.replace(/<html\b([^>]*)>/i, '<html$1 data-environment-system="development">'),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), markDevelopment()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // In development Vite serves the app and the API runs beside it. In production they are
      // one deployable, so the app only ever talks to same-origin /api either way.
      '/api': {
        target: process.env.API_ORIGIN ?? 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
