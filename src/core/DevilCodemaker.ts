import type { Codemaker } from './Codemaker';
import type { Code, Feedback, GameConfig, Rng } from './types';
import { DEFAULT_CONFIG } from './types';
import { allCodes, isValidCode, pickIndex } from './codeGenerator';
import { judge } from './judge';

/**
 * 惡魔出題者：不預先決定答案。
 *
 * 內部維護「所有與目前回饋一致的候選答案」，開局時是全部合法密碼。
 * 玩家每猜一次：
 *   1. 把候選依「對這次猜測會得到哪種回饋」分組
 *   2. 保留數量最多的那一組，回傳該組的回饋
 *   3. 數量相同的組用 rng 挑一個
 *   4. 只要還有其他組可選，絕不挑全中那一組
 *
 * 所以只有候選只剩一組、而玩家剛好猜中它時，才會得到全中。
 *
 * reveal() 回傳剩餘候選中的一組。每一組都與至今所有回饋一致，
 * 玩家中途放棄時揭曉的答案也說得通。揭曉之後答案固定，不能再判定。
 *
 * 候選與揭曉結果都存在 JS 私有欄位，外部無從讀取。
 * 介面是非同步的，但計算都在本地，Promise 會立刻完成。
 */
export class DevilCodemaker implements Codemaker {
  readonly #rng: Rng;
  #config: GameConfig = DEFAULT_CONFIG;
  #candidates: Code[] | null = null;
  #revealed: Code | null = null;

  constructor(rng: Rng = Math.random) {
    this.#rng = rng;
  }

  async startGame(config: GameConfig): Promise<void> {
    this.#config = config;
    this.#candidates = allCodes(config);
    this.#revealed = null;
  }

  async judge(guess: Code): Promise<Feedback> {
    const candidates = this.#requireCandidates();
    if (this.#revealed !== null) {
      throw new Error('DevilCodemaker.judge: 答案已揭曉，不能再判定');
    }
    if (!isValidCode(guess, this.#config)) {
      throw new Error(`DevilCodemaker.judge: 不合法的猜測 "${guess}"`);
    }

    // 1. 依回饋分組（Map 保留第一次出現的順序，讓同 seed 的結果可重現）
    const buckets = new Map<string, { feedback: Feedback; codes: Code[] }>();
    for (const code of candidates) {
      const feedback = judge(code, guess);
      const key = `${feedback.A}A${feedback.B}B`;
      const bucket = buckets.get(key);
      if (bucket) bucket.codes.push(code);
      else buckets.set(key, { feedback, codes: [code] });
    }

    // 2. 還有別的組可選時，排除全中那一組
    const winKey = `${this.#config.codeLength}A0B`;
    const contenders = [...buckets.entries()]
      .filter(([key]) => buckets.size === 1 || key !== winKey)
      .map(([, bucket]) => bucket);

    // 3. 挑數量最多的；同樣多就用 rng 決定
    const maxSize = Math.max(...contenders.map((bucket) => bucket.codes.length));
    const largest = contenders.filter((bucket) => bucket.codes.length === maxSize);
    const chosen = largest[pickIndex(this.#rng, largest.length)]!;

    this.#candidates = chosen.codes;
    return chosen.feedback;
  }

  async reveal(): Promise<Code> {
    const candidates = this.#requireCandidates();
    if (this.#revealed === null) {
      this.#revealed = candidates[pickIndex(this.#rng, candidates.length)]!;
    }
    return this.#revealed;
  }

  #requireCandidates(): Code[] {
    if (this.#candidates === null) {
      throw new Error('DevilCodemaker: 尚未呼叫 startGame()');
    }
    return this.#candidates;
  }
}
