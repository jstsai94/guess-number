import type { Rng } from '../types';

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
