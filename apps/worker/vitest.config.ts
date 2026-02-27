import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['../../vitest.app-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
      '@worker': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src')
    }
  }
});
