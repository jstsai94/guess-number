import { defineConfig } from 'vitest/config';

/**
 * Firestore 安全規則測試專用設定。
 *
 * 需要 Firestore 模擬器（也就需要 Java），所以不放進預設的 `npm run test`；
 * CI 以 `firebase emulators:exec` 啟動模擬器後執行 `npm run test:rules`。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.spec.ts'],
    // 規則測試共用同一個模擬器，依序執行避免互相清掉資料
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
