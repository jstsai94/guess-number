import type { Codemaker } from '../Codemaker';
import type { Code, Feedback, GameConfig, Rng } from '../types';
import { judge } from '../judge';

/** 列舉所有 4 碼且數字不重複的合法密碼，共 10*9*8*7 = 5040 組。 */
export function allValidCodes(length = 4): string[] {
  const out: string[] = [];
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  const walk = (prefix: string, used: boolean[]): void => {
    if (prefix.length === length) {
      out.push(prefix);
      return;
    }
    for (let i = 0; i < digits.length; i += 1) {
      if (used[i]) continue;
      used[i] = true;
      walk(prefix + digits[i], used);
      used[i] = false;
    }
  };

  walk('', new Array<boolean>(digits.length).fill(false));
  return out;
}

/** 依序回傳固定數列的 rng，用尾端值循環，讓測試具決定性。 */
export function seededRng(values: number[]): Rng {
  let i = 0;
  return () => {
    const v = values[i % values.length]!;
    i += 1;
    return v;
  };
}

/** 一個簡單的決定性偽亂數（mulberry32），用於需要大量取樣但要可重現的測試。 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 讓出事件迴圈，確保已經完成的 Promise 回呼都執行完畢。 */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 手動控制判定時機的出題者（測試替身）。
 *
 * judge() 不會自己完成，要由測試呼叫 resolveNext() / rejectNext()，
 * 用來模擬連線對戰「等對手或伺服器回應」的情境。答案固定。
 */
export class ManualCodemaker implements Codemaker {
  readonly answer: Code;
  readonly #pending: Array<{
    guess: Code;
    resolve: (feedback: Feedback) => void;
    reject: (error: unknown) => void;
  }> = [];

  constructor(answer: Code = '0123') {
    this.answer = answer;
  }

  async startGame(_config: GameConfig): Promise<void> {}

  judge(guess: Code): Promise<Feedback> {
    return new Promise((resolve, reject) => {
      this.#pending.push({ guess, resolve, reject });
    });
  }

  async reveal(): Promise<Code> {
    return this.answer;
  }

  /** 還在等待判定的猜測數量。 */
  get pendingCount(): number {
    return this.#pending.length;
  }

  /** 以真正的判定結果完成最早的一筆。 */
  resolveNext(): void {
    const next = this.#pending.shift();
    if (!next) throw new Error('ManualCodemaker: 沒有等待中的判定');
    next.resolve(judge(this.answer, next.guess));
  }

  /** 讓最早的一筆判定失敗。 */
  rejectNext(error: unknown): void {
    const next = this.#pending.shift();
    if (!next) throw new Error('ManualCodemaker: 沒有等待中的判定');
    next.reject(error);
  }
}
