import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: path.resolve(__dirname, 'src/polyfills/buffer.ts'),
      util: path.resolve(__dirname, 'src/polyfills/node-builtins.ts'),
      http: path.resolve(__dirname, 'src/polyfills/node-builtins.ts'),
      https: path.resolve(__dirname, 'src/polyfills/node-builtins.ts'),
      crypto: path.resolve(__dirname, 'src/polyfills/node-builtins.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/tee-api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/tee-api/, ''),
      },
    },
  },
});
