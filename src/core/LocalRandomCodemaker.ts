import type { Codemaker } from './Codemaker';
import type { Code, Feedback, GameConfig, Rng } from './types';
import { DEFAULT_CONFIG } from './types';
import { generateCode, isValidCode } from './codeGenerator';
import { judge } from './judge';

/**
 * 本地隨機出題者：開局時抽一組答案，之後固定不變。
 *
 * 答案存放在 JS 私有欄位（#answer）中，即使用 `as any` 也讀不到，
 * 確保 UI 層唯一取得答案的管道是 reveal()。
 */
export class LocalRandomCodemaker implements Codemaker {
  readonly #rng: Rng;
  #config: GameConfig = DEFAULT_CONFIG;
  #answer: Code | null = null;

  constructor(rng: Rng = Math.random) {
    this.#rng = rng;
  }

  startGame(config: GameConfig): void {
    this.#config = config;
    this.#answer = generateCode(config, this.#rng);
  }

  judge(guess: Code): Feedback {
    const answer = this.#requireAnswer();
    if (!isValidCode(guess, this.#config)) {
      throw new Error(`LocalRandomCodemaker.judge: 不合法的猜測 "${guess}"`);
    }
    return judge(answer, guess);
  }

  reveal(): Code {
    return this.#requireAnswer();
  }

  #requireAnswer(): Code {
    if (this.#answer === null) {
      throw new Error('LocalRandomCodemaker: 尚未呼叫 startGame()');
    }
    return this.#answer;
  }
}
