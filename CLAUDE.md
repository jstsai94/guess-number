# CLAUDE.md — 本專案工作守則

專案：1A2B 猜數字（桌機版）
規格唯一來源：[SPEC.md](./SPEC.md)

---

## 最重要的兩條規則

1. **不要在未被要求時重構既有檔案。**
   即使看到可以改得更好的地方，也不要順手改。
   要改，先提出來，等同意再動。

2. **不要建立 SPEC.md 沒有提到的功能。**
   不加「順便做一下」的功能、不加額外的設定項、不加沒人要求的動畫或快捷鍵。
   覺得該加，先寫進 SPEC.md 並取得同意，再實作。

---

## 架構紀律

本專案未來要擴充「惡魔模式」與「雙人對戰」，所有設計都必須替這兩件事留路。

### 1. 出題邏輯必須可抽換

`Codemaker` 介面**只暴露三個方法**，不要擴充：

```ts
interface Codemaker {
  startGame(config: GameConfig): void;
  judge(guess: Code): Feedback;
  reveal(): Code;
}
```

- 本次只實作 `LocalRandomCodemaker`（開局隨機抽一組答案，之後不變）
- 未來的惡魔模式、雙人對戰各自提供新的 `Codemaker` 實作，
  `GameSession` 與 UI **都不需要修改**

### 2. UI 層絕對不可以直接讀取答案

- UI 只拿得到 `GameSession`，拿不到 `Codemaker`
- `GameSession.getAnswer()` 在 `status === 'playing'` 時**一律回傳 `null`**
- `LocalRandomCodemaker` 的答案存在 JS 私有欄位 `#answer`，
  即使 `as any` 也讀不到 —— 這是刻意的，不要改成一般欄位

### 3. 「一局遊戲」是可以同時存在多份的資料結構

- 一局 = 一個 `GameSession` 實例
- **禁止**出現 `currentAnswer`、`guessHistory`、`currentGame` 這類模組層級的可變狀態
- 未來對戰模式畫面上會同時有兩局，任何「只能有一局」的假設都是 bug

### 4. 目錄職責

```
src/
├─ core/              純邏輯，禁止 import 任何 DOM API
│  ├─ types.ts               型別與預設設定
│  ├─ Codemaker.ts           出題者介面（唯一抽換點）
│  ├─ judge.ts               純函式判定 xAyB
│  ├─ codeGenerator.ts       產生答案 + 合法性檢查
│  ├─ LocalRandomCodemaker.ts
│  ├─ GameSession.ts         一局遊戲
│  ├─ index.ts               對外出入口
│  └─ __tests__/             Vitest 測試
├─ ui/                介面層（Phase 2 起）
└─ main.ts            進入點
```

- `src/core/` 內**不得**出現 `document`、`window`、`localStorage`、
  `navigator`、`HTMLElement` 等任何瀏覽器 API
- UI 層一律從 `src/core/index.ts` 匯入，**不要**深入 core 內部個別檔案
- `core` 不知道 UI 的存在；資料流是單向的

### 5. 純度與可測試性

- `judge` 是純函式：不持有狀態、不修改輸入
- 亂數來源 (`Rng`) 與時鐘 (`now`) 都可注入，讓測試具決定性
- 新增核心邏輯時，同時補上 `src/core/__tests__/` 的測試

---

## 分階段執行

一次只做一個階段，**做完停下來等確認，不要自己往下做**。
階段清單與目前進度見 [SPEC.md](./SPEC.md) 第 5 節。

---

## 慣例

- 介面文字**全部使用繁體中文**
- 桌機為主但**手機／平板也要能好好玩**：最大寬度 1180px、基準字 16px，
  斷點與內建數字鍵盤的規則見 SPEC.md 第 4 節「響應式」
- **不做深色主題**
- 輸入用的數字格一律是 `<button>`，**永遠不要改回 `<input>`** ——
  那會在觸控裝置上叫出系統鍵盤，正是我們要避免的問題
- 錯誤原因在 `core` 用 `RejectReason` 代碼表示，
  中文訊息由 UI 層負責翻譯 —— 不要把使用者介面文字寫進 `core`

## 指令

```bash
npm run dev        # 開發伺服器（port 5180）
npm run test       # Vitest watch
npm run test:run   # Vitest 單次執行
npm run typecheck  # tsc --noEmit
npm run build      # tsc && vite build
npm run bundle     # build + 打包成單檔 dist/artifact.html
```

## 發佈

有兩個線上版本，來源不同：

### GitHub Pages（公開，免登入）

<https://jstsai94.github.io/guess-number/>

**push 到 `main` 就自動部署**，本機不必跑任何指令。
CI 會跑 `npm ci` → `npm run test:run` → `npm run bundle`，
測試沒過就不部署，通過才把 `docs/` 發佈上去。

`docs/` 與 `dist/` 都是建置產物、**不進版控** —— 不要 commit 它們。

### Claude Artifact（需 Claude 帳號）

這個沒有自動化，要手動更新：

1. `npm run bundle`
2. 請 Claude 用**同一個 artifact 網址**重新發佈 `dist/artifact.html`
   （不帶網址會變成另一個新頁面）

`dist/artifact.html` 沒有 `<!DOCTYPE>` / `<html>` / `<head>` / `<body>`，
因為 Artifact 發佈時會自己包上這層外殼（含 charset）。
`docs/index.html` 則是補齊外殼的完整網頁，給一般靜態主機用。
