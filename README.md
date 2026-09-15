# 1A2B 猜數字

[![建置與部署](https://github.com/jstsai94/guess-number/actions/workflows/deploy.yml/badge.svg)](https://github.com/jstsai94/guess-number/actions/workflows/deploy.yml)

4 位不重複數字的猜數字遊戲。電腦出題，玩家猜，回饋 `xAyB`。
桌機、平板、手機都能玩 —— 觸控裝置用頁面內建數字鍵盤，不會跳出系統鍵盤。

**線上遊玩：** https://jstsai94.github.io/guess-number/

## 玩法

- 答案是 4 個互不重複的數字，首位可以是 0（例如 `0123`）
- **A** = 數字對且位置對，**B** = 數字對但位置錯
- 猜到 `4A0B` 獲勝，沒有次數上限
- 第 10 次猜測後會出現「放棄」按鈕
- 桌機可以直接用實體鍵盤打字；手機與平板用頁面內建的數字鍵盤
- 右邊筆記板有兩層：數字狀態列（排除 / 必有）與 10×4 位置推理表（可能 / 不可能 / 確定）
- 猜到 `0A0B` 時會問你要不要把那四個數字自動標記為排除

## 開發

```bash
npm install
npm run dev        # 開發伺服器（port 5180）
npm run test       # Vitest watch
npm run test:run   # 單次執行
npm run typecheck  # tsc --noEmit
npm run build      # 型別檢查 + 建置，輸出到 dist/
```

`npm run build` 會把網站輸出到 `dist/`，也就是部署到 GitHub Pages 的內容。它不進版控，由 CI 產生。
單機模式（一般、惡魔、電腦解題）完全不需要網路；連線模式的 Firebase 模組只有在進入對戰時才會下載。

## 部署

push 到 `main` 就會自動部署，不需要在本機跑任何指令：

1. GitHub Actions 平行執行：單元測試與建置、安全規則測試（Firestore 模擬器）
2. **任何一項沒過就不會部署**
3. 全部通過後把 `dist/` 發佈到 GitHub Pages

workflow 見 [.github/workflows/deploy.yml](./.github/workflows/deploy.yml)，
也可以在 Actions 頁面手動觸發。

## 架構

```
src/
├─ core/              純邏輯，不含任何 DOM API
│  ├─ Codemaker.ts           出題者介面（唯一抽換點，只有三個方法）
│  ├─ LocalRandomCodemaker.ts  本次唯一實作
│  ├─ GameSession.ts         一局遊戲，可同時存在多份
│  ├─ GameNotes.ts           一局的筆記狀態（數字狀態列 + 位置推理表）
│  ├─ judge.ts / codeGenerator.ts / types.ts
│  └─ __tests__/             Vitest（80 項）
├─ ui/                介面層，只透過 src/core/index.ts 與核心互動
└─ main.ts
```

出題邏輯藏在 `Codemaker` 介面後面，是為了之後能加「惡魔模式」與「雙人對戰」：
新模式只需要提供新的 `Codemaker` 實作，`GameSession` 與 UI 都不必改。
UI 拿不到 `Codemaker`，而 `GameSession.getAnswer()` 在遊戲進行中一律回傳 `null`。

詳細規格見 [SPEC.md](./SPEC.md)，架構紀律見 [CLAUDE.md](./CLAUDE.md)。

## 技術

Vite + TypeScript（vanilla-ts），沒有 UI 框架。測試用 Vitest。
唯一的執行期依賴是 Firebase，只在連線對戰時按需載入。
