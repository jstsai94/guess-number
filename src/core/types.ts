/**
 * 核心型別定義。
 *
 * 本檔案（以及整個 src/core/）為純邏輯層，
 * 不得 import 任何 DOM API 或瀏覽器專屬物件。
 */

/** 一組密碼，以字串表示，例如 "0123"。首位允許為 0。 */
export type Code = string;

/** 一次猜測的判定結果：A = 數字對且位置對，B = 數字對但位置錯。 */
export interface Feedback {
  readonly A: number;
  readonly B: number;
}

/** 一局遊戲的規則設定。一般模式與惡魔模式共用同一組欄位，差別只在 Codemaker 的實作。 */
export interface GameConfig {
  /** 密碼長度，預設 4。 */
  readonly codeLength: number;
  /** 是否允許密碼內出現重複數字，預設 false。 */
  readonly allowDuplicateDigits: boolean;
}

/** 預設規則：4 碼、數字不重複。 */
export const DEFAULT_CONFIG: GameConfig = {
  codeLength: 4,
  allowDuplicateDigits: false,
};

/** 一局遊戲的狀態。'won' 與 'surrendered' 在統計上分開計算。 */
export type GameStatus = 'playing' | 'won' | 'surrendered';

/** 歷史紀錄中的一列。 */
export interface GuessRecord {
  /** 第幾次猜測，從 1 開始。 */
  readonly index: number;
  readonly guess: Code;
  readonly feedback: Feedback;
  /** 判定完成、寫入歷史當下的 timestamp（毫秒）。 */
  readonly at: number;
}

/** 猜測被擋下的原因。對應的中文訊息由 UI 層決定。 */
export type RejectReason =
  /** 非 4 碼、含非數字、或有重複數字 */
  | 'invalid'
  /** 這組數字先前已經猜過 */
  | 'duplicate'
  /** 這一局已經結束（獲勝或放棄），或在等待判定期間結束 */
  | 'finished'
  /** 這一局暫停中，暫停期間不接受任何猜測 */
  | 'paused'
  /** 上一次猜測還在等待判定（連線對戰時可能發生），不接受新的猜測 */
  | 'pending';

/** submitGuess 的回傳值。被擋下時不計次。 */
export type SubmitResult =
  | { readonly ok: true; readonly record: GuessRecord }
  | { readonly ok: false; readonly reason: RejectReason };

/** 可注入的亂數來源，回傳 [0, 1) 之間的浮點數，介面同 Math.random。 */
export type Rng = () => number;

/** 不合法的原因，供 UI 層翻成對應的中文訊息。 */
export type CodeIssue =
  /** 長度不符（通常是還沒填滿） */
  | 'length'
  /** 含有非 0-9 的字元 */
  | 'non-digit'
  /** 有重複的數字 */
  | 'duplicate-digit';

/** 筆記板上單一數字的標記狀態。 */
export type DigitMark = 'unknown' | 'excluded' | 'required';

/** 筆記板可標記的十個數字。 */
export const NOTE_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/** 位置推理表上「某個數字放在某一位」的標記狀態。 */
export type PositionMark = 'possible' | 'impossible' | 'confirmed';
