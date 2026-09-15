# CLAUDE.md — 本專案工作守則

專案：1A2B 猜數字
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

本專案支援多種出題方式（一般、惡魔、連線對戰），所有設計都必須讓出題方式可以抽換。

### 1. 出題邏輯必須可抽換

`Codemaker` 介面**只暴露三個方法**，不要擴充：

```ts
interface Codemaker {
  startGame(config: GameConfig): Promise<void>;
  judge(guess: Code): Promise<Feedback>;
  reveal(): Promise<Code>;
}
```

實作：

- `LocalRandomCodemaker` — 一般模式：開局隨機抽一組答案，之後不變
- `DevilCodemaker` — 惡魔模式：不預先決定答案，每次保留最大的候選分組
- 連線對戰的實作（對手裝置判定、伺服器判定）放在 `src/online/`，**不放進 `core`**

`GameSession` 與 UI 不需要知道用的是哪一種 Codemaker。

三個方法都是**非同步**的：本地實作立刻完成，連線對戰則要等網路回應。

- 開局一律用 `await GameSession.create(codemaker)`；建構子是 private，不要直接 `new`
- 等待判定期間再送出，`submitGuess` 會以 `'pending'` 擋下，不計次
- 判定失敗時例外往外拋，該組數字不計次、不記為已猜過，可以重送

### 2. UI 層絕對不可以直接讀取答案

- UI 只拿得到 `GameSession`，拿不到 `Codemaker`
- `GameSession.getAnswer()` 在 `status === 'playing'` 時**一律解析為 `null`**
- Codemaker 的答案與候選一律存在 JS 私有欄位（`#answer`、`#candidates`），
  即使 `as any` 也讀不到 —— 這是刻意的，不要改成一般欄位

### 3. 「一局遊戲」是可以同時存在多份的資料結構

- 一局 = 一個 `GameSession` 實例（含筆記、暫停狀態）
- **禁止**出現 `currentAnswer`、`guessHistory`、`currentGame` 這類模組層級的可變狀態
- 對戰模式畫面上會同時有兩局，任何「只能有一局」的假設都是 bug

### 4. 目錄職責

```
src/
├─ core/              純邏輯，禁止 import 任何 DOM API 或 Firebase
│  ├─ types.ts               型別與預設設定
│  ├─ Codemaker.ts           出題者介面（唯一抽換點）
│  ├─ judge.ts               純函式判定 xAyB
│  ├─ codeGenerator.ts       產生答案、列舉所有答案、合法性檢查
│  ├─ LocalRandomCodemaker.ts  一般模式
│  ├─ DevilCodemaker.ts      惡魔模式
│  ├─ GameNotes.ts           一局的筆記狀態
│  ├─ GameSession.ts         一局遊戲（含暫停、放棄）
│  ├─ index.ts               對外出入口
│  └─ __tests__/             Vitest 測試
├─ online/            連線對戰（第二期 D 起）：Firebase、網路 Codemaker
├─ ui/                介面層
└─ main.ts            進入點
```

- `src/core/` 內**不得**出現 `document`、`window`、`localStorage`、
  `navigator`、`HTMLElement` 等任何瀏覽器 API，也**不得** import Firebase
- UI 層一律從 `src/core/index.ts` 匯入，**不要**深入 core 內部個別檔案
- `core` 不知道 UI 與網路的存在；資料流是單向的

### 5. 純度與可測試性

- `judge` 是純函式：不持有狀態、不修改輸入
- 亂數來源 (`Rng`) 與時鐘 (`now`) 都可注入，讓測試具決定性
- 新增核心邏輯時，同時補上 `src/core/__tests__/` 的測試

### 6. 連線對戰的防作弊紀律

- 資料庫**永遠不存明文密碼或答案**
- 互相出題：只存 `SHA-256(密碼 + 鹽)`，結束時公開並核對每一次回饋
- 同一題比速度（第二期 E）已取消：專案只用 Firebase 免費方案，不要加入需要付費的服務
- 用時一律以**伺服器時間戳記**計算，不信任用戶端時鐘

---

## 分階段執行

一次只做一個階段，**做完停下來等確認，不要自己往下做**。
目前在「第二期」，階段清單與進度見 [SPEC.md](./SPEC.md) 第 5 節。

---

## 慣例

- 介面文字**全部使用繁體中文**
- 桌機為主但**手機／平板也要能好好玩**：桌機（≥1001px）最大寬度 1320px、基準字 19px，
  較窄的畫面基準字 16px；
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
npm run build      # tsc && vite build，輸出到 dist/（GitHub Pages 的部署內容）
npm run test:rules # 安全規則測試（需要 Firestore 模擬器與 Java，平常由 CI 執行）
```

## 發佈

線上版：<https://jstsai94.github.io/guess-number/>（公開，免登入）

**push 到 `main` 就自動部署**，本機不必跑任何指令。
CI 會跑三件事：單元測試與建置、安全規則測試（Firestore 模擬器），
任何一項沒過就不部署，全部通過才把 `dist/` 發佈上去。

`dist/` 是建置產物、**不進版控** —— 不要 commit 它。

連線對戰模組（`src/online/`）一律以 `import()` 按需載入，
只玩猜電腦的人不會下載 Firebase。
