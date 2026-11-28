/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Config Vite : React + Tailwind v4 + alias @ + Vitest (jsdom)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // PORT est injecté par les previews (agents) ; 5173 sinon.
    port: Number(process.env.PORT) || 5173,
    // Domaines OrbStack (*.orb.local)
    allowedHosts: ['.orb.local'],
    // Proxy /api vers le backend (même origine)
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:8000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
