import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    // 壓縮器預設會把 max-width 改寫成 CSS Level 4 區間語法（width<=720px），
    // 那需要 Safari 16.4+。舊手機看不懂會整條媒體查詢丟掉，
    // 結果就是既沒有內建數字鍵盤、又叫不出系統鍵盤，完全無法輸入。
    cssTarget: ['chrome87', 'safari13.1', 'firefox78', 'edge88'],
  },
  test: {
    // core 為純邏輯，不需要 DOM 環境
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
