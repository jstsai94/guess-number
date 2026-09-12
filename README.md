# 2A2B 猜數字

4 位不重複數字的猜數字遊戲，桌機版。電腦出題，玩家猜，回饋 `xAyB`。

**線上遊玩：** https://jstsai94.github.io/guess-number/

## 玩法

- 答案是 4 個互不重複的數字，首位可以是 0（例如 `0123`）
- **A** = 數字對且位置對，**B** = 數字對但位置錯
- 猜到 `4A0B` 獲勝，沒有次數上限
- 第 10 次猜測後會出現「放棄」按鈕
- 右邊筆記板可以標記每個數字「排除 / 必有」，猜到 `0A0B` 時會問你要不要自動標記

## 開發

```bash
npm install
npm run dev        # 開發伺服器（port 5180）
npm run test       # Vitest watch
npm run test:run   # 單次執行
npm run typecheck  # tsc --noEmit
npm run bundle     # 建置 + 打包成單檔
```

`npm run bundle` 會產出兩個檔案，兩者都是 CSS/JS 全部內嵌、**零外部請求**的單一 HTML：

| 檔案 | 用途 |
| --- | --- |
| `docs/index.html` | GitHub Pages 的實際來源，也可以直接雙擊開啟 |
| `dist/artifact.html` | 給 Claude Artifact 用（發佈時平台會自己包外層骨架） |

改完程式碼要更新線上版：跑 `npm run bundle`，然後 commit `docs/index.html` 並 push，
GitHub Pages 會自動更新。

## 架構

```
src/
├─ core/              純邏輯，不含任何 DOM API
│  ├─ Codemaker.ts           出題者介面（唯一抽換點，只有三個方法）
│  ├─ LocalRandomCodemaker.ts  本次唯一實作
│  ├─ GameSession.ts         一局遊戲，可同時存在多份
│  ├─ GameNotes.ts           一局的筆記狀態
│  ├─ judge.ts / codeGenerator.ts / types.ts
│  └─ __tests__/             Vitest（76 項）
├─ ui/                介面層，只透過 src/core/index.ts 與核心互動
└─ main.ts
```

出題邏輯藏在 `Codemaker` 介面後面，是為了之後能加「惡魔模式」與「雙人對戰」：
新模式只需要提供新的 `Codemaker` 實作，`GameSession` 與 UI 都不必改。
UI 拿不到 `Codemaker`，而 `GameSession.getAnswer()` 在遊戲進行中一律回傳 `null`。

詳細規格見 [SPEC.md](./SPEC.md)，架構紀律見 [CLAUDE.md](./CLAUDE.md)。

## 技術

Vite + TypeScript（vanilla-ts），零執行期依賴，沒有 UI 框架。測試用 Vitest。
