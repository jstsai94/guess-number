import { describe, it, expect } from 'vitest';
import { judge } from '../judge';
import { allValidCodes } from './helpers';

describe('judge', () => {
  it('完全猜中回傳 4A0B', () => {
    expect(judge('1234', '1234')).toEqual({ A: 4, B: 0 });
  });

  it('數字全對但位置全錯回傳 0A4B', () => {
    expect(judge('1234', '4321')).toEqual({ A: 0, B: 4 });
  });

  it('兩個位置正確、兩個位置互換回傳 2A2B', () => {
    expect(judge('1234', '1243')).toEqual({ A: 2, B: 2 });
  });

  it('完全沒中回傳 0A0B', () => {
    expect(judge('1234', '5678')).toEqual({ A: 0, B: 0 });
  });

  it('首位為 0 的答案可以正常判定', () => {
    expect(judge('0123', '0132')).toEqual({ A: 2, B: 2 });
    expect(judge('0123', '0123')).toEqual({ A: 4, B: 0 });
    expect(judge('0123', '4567')).toEqual({ A: 0, B: 0 });
    expect(judge('0123', '3210')).toEqual({ A: 0, B: 4 });
  });

  it('部分命中：1A2B / 3A0B', () => {
    expect(judge('1234', '1325')).toEqual({ A: 1, B: 2 });
    expect(judge('1234', '1235')).toEqual({ A: 3, B: 0 });
  });

  it('為純函式，不改動輸入字串', () => {
    const answer = '1234';
    const guess = '4321';
    judge(answer, guess);
    expect(answer).toBe('1234');
    expect(guess).toBe('4321');
  });

  it('長度不一致時拋出錯誤', () => {
    expect(() => judge('1234', '123')).toThrow();
  });

  describe('全域不變式（取樣 60 組答案 × 全部 5040 組猜測）', () => {
    const codes = allValidCodes();
    // 在 5040 組中平均取樣 60 組當答案，測試具決定性
    const step = Math.floor(codes.length / 60);
    const sampledAnswers = codes.filter((_, i) => i % step === 0);

    it('A + B 永遠不超過 4', () => {
      let worst = 0;
      for (const answer of sampledAnswers) {
        for (const guess of codes) {
          const { A, B } = judge(answer, guess);
          worst = Math.max(worst, A + B);
        }
      }
      expect(worst).toBe(4);
    });

    it('不可能產生 3A1B', () => {
      const offenders: string[] = [];
      for (const answer of sampledAnswers) {
        for (const guess of codes) {
          const { A, B } = judge(answer, guess);
          if (A === 3 && B === 1) offenders.push(`${answer} vs ${guess}`);
        }
      }
      expect(offenders).toEqual([]);
    });

    it('A、B 皆為非負整數', () => {
      for (const answer of sampledAnswers) {
        for (const guess of codes) {
          const { A, B } = judge(answer, guess);
          if (!Number.isInteger(A) || !Number.isInteger(B) || A < 0 || B < 0) {
            throw new Error(`非法結果 ${answer} vs ${guess} → ${A}A${B}B`);
          }
        }
      }
    });
  });

  it('窮舉單一答案對全部 5040 組猜測，恰好一組 4A0B 且無 3A1B', () => {
    const codes = allValidCodes();
    let perfect = 0;
    for (const guess of codes) {
      const { A, B } = judge('0123', guess);
      expect(A === 3 && B === 1).toBe(false);
      if (A === 4 && B === 0) perfect += 1;
    }
    expect(perfect).toBe(1);
  });
});
