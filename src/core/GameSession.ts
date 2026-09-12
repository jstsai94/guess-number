import type { Codemaker } from './Codemaker';
import type { Code, GameConfig, GameStatus, GuessRecord, SubmitResult } from './types';
import { DEFAULT_CONFIG } from './types';
import { isValidCode } from './codeGenerator';
import { GameNotes } from './GameNotes';

/** 第幾次猜測結束後才允許放棄。 */
export const SURRENDER_THRESHOLD = 10;

export interface GameSessionOptions {
  /** 覆寫預設規則，未指定的欄位沿用 DEFAULT_CONFIG。 */
  config?: Partial<GameConfig>;
  /** 可注入的時鐘，方便測試。預設 Date.now。 */
  now?: () => number;
  /** 可指定固定 id，方便測試。預設自動產生。 */
  id?: string;
}

/**
 * 「一局遊戲」。
 *
 * 刻意設計成可以同時存在多份實例（未來雙人對戰時畫面上會有兩局），
 * 所有狀態都在實例內部，模組層級沒有任何可變的遊戲狀態。
 *
 * UI 層只會拿到 GameSession，拿不到 Codemaker，
 * 而 getAnswer() 在遊戲進行中一律回傳 null —— 從執行期擋住偷看答案。
 */
export class GameSession {
  readonly id: string;
  readonly config: GameConfig;
  readonly startedAt: number;
  /** 本局的筆記板狀態。新局＝新的 GameSession，筆記自動重置。 */
  readonly notes: GameNotes = new GameNotes();

  readonly #codemaker: Codemaker;
  readonly #now: () => number;
  readonly #guesses: GuessRecord[] = [];
  readonly #guessed = new Set<Code>();

  #status: GameStatus = 'playing';
  #finishedAt: number | null = null;

  constructor(codemaker: Codemaker, options: GameSessionOptions = {}) {
    this.#codemaker = codemaker;
    this.#now = options.now ?? Date.now;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.id = options.id ?? createSessionId();
    this.startedAt = this.#now();

    this.#codemaker.startGame(this.config);
  }

  get status(): GameStatus {
    return this.#status;
  }

  /** 已計次的歷史紀錄，依時間由舊到新。回傳唯讀陣列，外部無法改動內部狀態。 */
  get guesses(): readonly GuessRecord[] {
    return [...this.#guesses];
  }

  /** 已計次的猜測次數。被擋下的輸入不計入。 */
  get guessCount(): number {
    return this.#guesses.length;
  }

  /** 是否已結束（獲勝或放棄）。 */
  get isFinished(): boolean {
    return this.#status !== 'playing';
  }

  /** 放棄按鈕是否該存在：第 SURRENDER_THRESHOLD 次猜測結束後才為 true。 */
  get canSurrender(): boolean {
    return this.#status === 'playing' && this.#guesses.length >= SURRENDER_THRESHOLD;
  }

  get finishedAt(): number | null {
    return this.#finishedAt;
  }

  /** 本局經過時間（毫秒）。進行中以當下時間計算，結束後固定。 */
  get elapsedMs(): number {
    return (this.#finishedAt ?? this.#now()) - this.startedAt;
  }

  /** 這組數字是否已經猜過。 */
  hasGuessed(guess: string): boolean {
    return this.#guessed.has(guess);
  }

  /**
   * 送出一次猜測。
   *
   * 非法輸入、重複猜測、已結束的局都會被擋下且「不計次」，
   * 回傳的 reason 由 UI 層翻成對應的中文訊息。
   */
  submitGuess(guess: string): SubmitResult {
    if (this.#status !== 'playing') {
      return { ok: false, reason: 'finished' };
    }
    if (!isValidCode(guess, this.config)) {
      return { ok: false, reason: 'invalid' };
    }
    if (this.#guessed.has(guess)) {
      return { ok: false, reason: 'duplicate' };
    }

    const feedback = this.#codemaker.judge(guess);
    const record: GuessRecord = {
      index: this.#guesses.length + 1,
      guess,
      feedback,
      at: this.#now(),
    };

    this.#guesses.push(record);
    this.#guessed.add(guess);

    if (feedback.A === this.config.codeLength) {
      this.#finish('won');
    }

    return { ok: true, record };
  }

  /**
   * 放棄本局。只有在 canSurrender 為 true 時才會成功。
   * 二次確認由 UI 層負責。
   */
  surrender(): boolean {
    if (!this.canSurrender) return false;
    this.#finish('surrendered');
    return true;
  }

  /** 取得答案。遊戲進行中一律回傳 null。 */
  getAnswer(): Code | null {
    if (this.#status === 'playing') return null;
    return this.#codemaker.reveal();
  }

  #finish(status: Exclude<GameStatus, 'playing'>): void {
    this.#status = status;
    this.#finishedAt = this.#now();
  }
}

/** 產生一個夠用的區域 id，不依賴任何模組層級的可變狀態。 */
function createSessionId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
