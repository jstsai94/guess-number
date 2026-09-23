import type { Codemaker } from './Codemaker';
import type { Code, Feedback, GameConfig, GameStatus, GuessRecord, SubmitResult } from './types';
import { DEFAULT_CONFIG } from './types';
import { isValidCode } from './codeGenerator';
import { GameNotes } from './GameNotes';

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
 * 刻意設計成可以同時存在多份實例（對戰時畫面上會有兩局），
 * 所有狀態都在實例內部，模組層級沒有任何可變的遊戲狀態。
 *
 * GameSession 可以搭配任何 Codemaker（一般、惡魔、連線對戰），
 * 它不知道也不在乎答案是怎麼產生的、判定要等多久。
 *
 * UI 層只會拿到 GameSession，拿不到 Codemaker，
 * 而 getAnswer() 在遊戲進行中一律解析為 null —— 從執行期擋住偷看答案。
 */
export class GameSession {
  readonly id: string;
  readonly config: GameConfig;
  /** 開局（建立）時間。計時另從第一次送出開始，見 elapsedMs。 */
  readonly startedAt: number;
  /** 本局的筆記板狀態。新局＝新的 GameSession，筆記自動重置。 */
  readonly notes: GameNotes = new GameNotes();

  readonly #codemaker: Codemaker;
  readonly #now: () => number;
  readonly #guesses: GuessRecord[] = [];
  readonly #guessed = new Set<Code>();

  /** 計時起點：第一次送出猜測的時間；還沒送出過為 null。 */
  #clockStartedAt: number | null = null;
  #status: GameStatus = 'playing';
  #finishedAt: number | null = null;
  /** 目前這次暫停的開始時間；沒有在暫停時為 null。 */
  #pausedAt: number | null = null;
  /** 已經結束的暫停累計時長。 */
  #pausedTotalMs = 0;
  /** 是否有一次猜測正在等待 Codemaker 判定。 */
  #judging = false;

  /**
   * 建立並開始一局。
   *
   * 用工廠方法而不是建構子，因為 Codemaker.startGame 是非同步的 ——
   * 建構子無法等待，會產生「物件建好了、遊戲卻還沒準備好」的半成品。
   * 開局時間以 startGame 完成的那一刻為準。
   */
  static async create(codemaker: Codemaker, options: GameSessionOptions = {}): Promise<GameSession> {
    const config: GameConfig = { ...DEFAULT_CONFIG, ...options.config };
    await codemaker.startGame(config);
    return new GameSession(codemaker, config, options);
  }

  private constructor(codemaker: Codemaker, config: GameConfig, options: GameSessionOptions) {
    this.#codemaker = codemaker;
    this.#now = options.now ?? Date.now;
    this.config = config;
    this.id = options.id ?? createSessionId();
    this.startedAt = this.#now();
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

  /** 是否暫停中。 */
  get isPaused(): boolean {
    return this.#pausedAt !== null;
  }

  /** 是否可以放棄：進行中隨時可以（包含開局還沒猜、暫停中、等待判定中）。 */
  get canSurrender(): boolean {
    return this.#status === 'playing';
  }

  get finishedAt(): number | null {
    return this.#finishedAt;
  }

  /**
   * 本局實際遊玩時間（毫秒），**不含暫停的時間**。
   *
   * 計時從**第一次送出猜測**開始：開局後的思考時間不計入，
   * 一次都還沒猜（例如直接放棄）時為 0。
   * 進行中以當下時間計算；暫停中停止增加；結束後固定。
   */
  get elapsedMs(): number {
    return this.#elapsedAt(this.#finishedAt ?? this.#now());
  }

  /** 這組數字是否已經猜過（只算判定完成、寫入歷史的）。 */
  hasGuessed(guess: string): boolean {
    return this.#guessed.has(guess);
  }

  /**
   * 送出一次猜測。
   *
   * 已結束、暫停中、等待上一次判定、非法輸入、重複猜測都會被擋下且「不計次」，
   * 回傳的 reason 由 UI 層翻成對應的中文訊息。
   *
   * 判定失敗（例如網路中斷）時例外會往外拋；該組數字不計次、
   * 也不會被記為已猜過，可以重新送出。
   */
  async submitGuess(guess: string): Promise<SubmitResult> {
    if (this.#status !== 'playing') {
      return { ok: false, reason: 'finished' };
    }
    if (this.#pausedAt !== null) {
      return { ok: false, reason: 'paused' };
    }
    if (this.#judging) {
      return { ok: false, reason: 'pending' };
    }
    if (!isValidCode(guess, this.config)) {
      return { ok: false, reason: 'invalid' };
    }
    if (this.#guessed.has(guess)) {
      return { ok: false, reason: 'duplicate' };
    }

    // 計時起點是「送出」的那一刻，判定等待的時間也算進去
    const submittedAt = this.#now();
    this.#judging = true;
    let feedback: Feedback;
    try {
      feedback = await this.#codemaker.judge(guess);
    } finally {
      this.#judging = false;
    }

    // 等待判定的期間這一局可能已經結束（例如玩家放棄），晚到的結果直接作廢
    if (this.#status !== 'playing') {
      return { ok: false, reason: 'finished' };
    }

    const at = this.#now();
    if (this.#clockStartedAt === null) {
      // 第一次送出：計時從這裡開始，之前的思考與暫停都不算
      this.#clockStartedAt = submittedAt;
      this.#pausedTotalMs = 0;
    }

    const record: GuessRecord = {
      index: this.#guesses.length + 1,
      guess,
      feedback,
      at,
      elapsedMs: this.#elapsedAt(at),
    };

    this.#guesses.push(record);
    this.#guessed.add(guess);

    if (feedback.A === this.config.codeLength) {
      this.#finish('won');
    }

    return { ok: true, record };
  }

  /** 暫停。只有進行中且尚未暫停時才會成功。 */
  pause(): boolean {
    if (this.#status !== 'playing' || this.#pausedAt !== null) return false;
    this.#pausedAt = this.#now();
    return true;
  }

  /** 從暫停繼續。只有暫停中才會成功。 */
  resume(): boolean {
    if (this.#pausedAt === null) return false;
    this.#pausedTotalMs += this.#now() - this.#pausedAt;
    this.#pausedAt = null;
    return true;
  }

  /**
   * 放棄本局。進行中隨時可以放棄（包含暫停中、等待判定中）。
   * 二次確認由 UI 層負責。
   */
  surrender(): boolean {
    if (!this.canSurrender) return false;
    this.#finish('surrendered');
    return true;
  }

  /** 取得答案。遊戲進行中一律解析為 null。 */
  async getAnswer(): Promise<Code | null> {
    if (this.#status === 'playing') return null;
    return this.#codemaker.reveal();
  }

  /** 某個時間點的本局用時；還沒開始計時一律是 0。 */
  #elapsedAt(end: number): number {
    if (this.#clockStartedAt === null) return 0;
    const ongoingPauseMs = this.#pausedAt === null ? 0 : end - this.#pausedAt;
    return end - this.#clockStartedAt - this.#pausedTotalMs - ongoingPauseMs;
  }

  #finish(status: Exclude<GameStatus, 'playing'>): void {
    const now = this.#now();
    // 暫停中結束（例如暫停時放棄）：先把這段暫停結算進去，用時才會正確
    if (this.#pausedAt !== null) {
      this.#pausedTotalMs += now - this.#pausedAt;
      this.#pausedAt = null;
    }
    this.#status = status;
    this.#finishedAt = now;
  }
}

/** 產生一個夠用的區域 id，不依賴任何模組層級的可變狀態。 */
function createSessionId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
