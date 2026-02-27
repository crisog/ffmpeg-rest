import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: process.env.TEST_MODE === 'integration' ? ['src/**/integration.test.ts'] : ['src/**/*.test.ts'],
    globalSetup:
      process.env.TEST_MODE === 'integration' ? ['../../vitest.integration-setup.ts'] : ['../../vitest.app-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@worker': path.resolve(__dirname, '../worker/src')
    }
  }
});
