import type { DigitMark } from './types';
import { NOTE_DIGITS } from './types';

/** 標記循環順序：未定 → 排除 → 必有 → 未定。 */
const CYCLE: readonly DigitMark[] = ['unknown', 'excluded', 'required'];

/**
 * 一局遊戲的筆記狀態（數字標記 + 自由備註）。
 *
 * 刻意做成 GameSession 的一部分，而不是獨立的全域狀態：
 * 新局＝新的 GameSession＝全新的 GameNotes，自動重置；
 * 未來雙人對戰時兩邊各有各的筆記，互不干擾。
 */
export class GameNotes {
  readonly #marks = new Map<string, DigitMark>();
  #memo = '';

  /** 取得某個數字目前的標記，沒標過就是 'unknown'。 */
  getMark(digit: string): DigitMark {
    return this.#marks.get(digit) ?? 'unknown';
  }

  setMark(digit: string, mark: DigitMark): void {
    if (mark === 'unknown') this.#marks.delete(digit);
    else this.#marks.set(digit, mark);
  }

  /** 點擊一次：未定 → 排除 → 必有 → 未定，回傳新狀態。 */
  cycleMark(digit: string): DigitMark {
    const current = this.getMark(digit);
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]!;
    this.setMark(digit, next);
    return next;
  }

  /** 把指定的幾個數字一次標記為排除（供 0A0B 的自動輔助使用）。 */
  excludeAll(digits: Iterable<string>): void {
    for (const digit of digits) this.setMark(digit, 'excluded');
  }

  /** 目前所有標記的快照，未標記的數字為 'unknown'。 */
  snapshot(): ReadonlyMap<string, DigitMark> {
    const out = new Map<string, DigitMark>();
    for (const digit of NOTE_DIGITS) out.set(digit, this.getMark(digit));
    return out;
  }

  get memo(): string {
    return this.#memo;
  }

  set memo(value: string) {
    this.#memo = value;
  }

  /** 清空全部標記與備註。 */
  reset(): void {
    this.#marks.clear();
    this.#memo = '';
  }
}
