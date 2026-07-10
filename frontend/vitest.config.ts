import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/polyfills.ts', './src/test/setup.ts'],
    globals: true,
    // e2e/ is a Playwright suite (its own runner); keep it out of vitest.
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '~backend/client': path.resolve(__dirname, './lib/apiClient'),
      '~backend': path.resolve(__dirname, '../backend'),
    },
  },
});
