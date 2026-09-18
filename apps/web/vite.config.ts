import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:8787', changeOrigin: true } },
  },
  preview: { host: '0.0.0.0', port: 3000, allowedHosts: true },
  test: { globals: true, environment: 'jsdom' },
});
