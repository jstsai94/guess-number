import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // core 為純邏輯，不需要 DOM 環境
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
