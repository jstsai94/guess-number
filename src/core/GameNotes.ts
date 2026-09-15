import type { DigitMark, PositionMark } from './types';
import { NOTE_DIGITS } from './types';

/** 數字狀態列的循環順序：未定 → 排除 → 必有 → 未定。 */
const DIGIT_CYCLE: readonly DigitMark[] = ['unknown', 'excluded', 'required'];

/** 位置推理表的循環順序：可能 → 不可能 → 確定 → 可能。 */
const POSITION_CYCLE: readonly PositionMark[] = ['possible', 'impossible', 'confirmed'];

/**
 * 一局遊戲的筆記狀態。
 *
 * 兩套標記：
 *   - 數字狀態列：這個數字「在不在答案裡」
 *   - 位置推理表：這個數字「能不能放在第 N 位」
 *
 * 單向連動：數字被標為「排除」時，位置推理表上這個數字的每一位一律視為「不可能」；
 * 取消排除後恢復玩家原本標的狀態。位置推理表不會反過來改動數字狀態列。
 *
 * 刻意做成 GameSession 的一部分，而不是獨立的全域狀態：
 * 新局＝新的 GameSession＝全新的 GameNotes，自動重置；
 * 未來雙人對戰時兩邊各有各的筆記，互不干擾。
 */
export class GameNotes {
  readonly #digitMarks = new Map<string, DigitMark>();
  readonly #positionMarks = new Map<string, PositionMark>();

  // ---------- 數字狀態列 ----------

  /** 取得某個數字目前的標記，沒標過就是 'unknown'。 */
  getMark(digit: string): DigitMark {
    return this.#digitMarks.get(digit) ?? 'unknown';
  }

  setMark(digit: string, mark: DigitMark): void {
    if (mark === 'unknown') this.#digitMarks.delete(digit);
    else this.#digitMarks.set(digit, mark);
  }

  /** 點擊一次：未定 → 排除 → 必有 → 未定，回傳新狀態。 */
  cycleMark(digit: string): DigitMark {
    const current = this.getMark(digit);
    const next = DIGIT_CYCLE[(DIGIT_CYCLE.indexOf(current) + 1) % DIGIT_CYCLE.length]!;
    this.setMark(digit, next);
    return next;
  }

  /** 把指定的幾個數字一次標記為排除（供 0A0B 的自動輔助使用）。 */
  excludeAll(digits: Iterable<string>): void {
    for (const digit of digits) this.setMark(digit, 'excluded');
  }

  /** 目前所有數字標記的快照，未標記的數字為 'unknown'。 */
  snapshot(): ReadonlyMap<string, DigitMark> {
    const out = new Map<string, DigitMark>();
    for (const digit of NOTE_DIGITS) out.set(digit, this.getMark(digit));
    return out;
  }

  // ---------- 位置推理表 ----------

  /**
   * 取得「digit 放在第 position 位」的標記，沒標過就是 'possible'。position 由 0 起算。
   * 數字已被排除時一律是 'impossible'。
   */
  getPositionMark(digit: string, position: number): PositionMark {
    if (this.isPositionLocked(digit)) return 'impossible';
    return this.#positionMarks.get(positionKey(digit, position)) ?? 'possible';
  }

  /** 數字已被排除：這個數字在位置推理表上鎖定為不可能，點擊無效。 */
  isPositionLocked(digit: string): boolean {
    return this.getMark(digit) === 'excluded';
  }

  setPositionMark(digit: string, position: number, mark: PositionMark): void {
    const key = positionKey(digit, position);
    if (mark === 'possible') this.#positionMarks.delete(key);
    else this.#positionMarks.set(key, mark);
  }

  /** 點擊一次：可能 → 不可能 → 確定 → 可能，回傳新狀態。數字已被排除時不改變。 */
  cyclePositionMark(digit: string, position: number): PositionMark {
    if (this.isPositionLocked(digit)) return 'impossible';
    const current = this.getPositionMark(digit, position);
    const next = POSITION_CYCLE[(POSITION_CYCLE.indexOf(current) + 1) % POSITION_CYCLE.length]!;
    this.setPositionMark(digit, position, next);
    return next;
  }

  // ---------- 重置 ----------

  /** 清掉全部標記（數字狀態列與位置推理表）。 */
  reset(): void {
    this.#digitMarks.clear();
    this.#positionMarks.clear();
  }
}

function positionKey(digit: string, position: number): string {
  return `${digit}:${position}`;
}
