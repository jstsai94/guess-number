import { describe, it, expect } from 'vitest';
import { allCodes } from '../codeGenerator';
import { judge } from '../judge';
import { chooseGuess, solveCode } from '../solver';
import type { Conclusion, SolverStep } from '../solver';
import type { Code } from '../types';

const ALL = allCodes();
/** 平均抽 52 組密碼，涵蓋 0 開頭、9 結尾等情況。 */
const SAMPLE = ALL.filter((_, i) => i % 97 === 0);
/** 解一組密碼約需數十毫秒，抽樣的測試共用同一份結果，並放寬逾時。 */
const SLOW = 60_000;

const solutions = new Map<Code, SolverStep[]>();
function solved(secret: Code): SolverStep[] {
  let steps = solutions.get(secret);
  if (!steps) {
    steps = solveCode(secret);
    solutions.set(secret, steps);
  }
  return steps;
}

function feedbackText(answer: Code, guess: Code): string {
  const { A, B } = judge(answer, guess);
  return `${A}A${B}B`;
}

describe('solveCode 基本行為', () => {
  it('第一次一律猜 0123', () => {
    expect(solved('4721')[0]!.guess).toBe('0123');
  });

  it(
    '每一步的回饋都正確、不重複猜，最後一步猜中',
    () => {
      for (const secret of SAMPLE) {
        const steps = solved(secret);
        steps.forEach((step, i) => {
          expect(step.index).toBe(i + 1);
          expect(step.feedback).toEqual(judge(secret, step.guess));
        });
        expect(new Set(steps.map((s) => s.guess)).size).toBe(steps.length);
        expect(steps.at(-1)!.guess).toBe(secret);
        expect(steps.slice(0, -1).every((s) => s.feedback.A !== 4)).toBe(true);
      }
    },
    SLOW,
  );

  it('同一組密碼每次的解題過程都一樣', () => {
    expect(solveCode('0856')).toEqual(solveCode('0856'));
  });

  it('不合法的密碼直接拋錯', () => {
    expect(() => solveCode('1123')).toThrow();
    expect(() => solveCode('123')).toThrow();
  });
});

describe('chooseGuess 最壞情況最少', () => {
  it('只剩一組可能時直接猜它', () => {
    expect(chooseGuess(['4721'])).toBe('4721');
  });

  it('選出的猜法，最壞情況不比任何其他猜法差', () => {
    const candidates = ALL.filter(
      (c) => feedbackText(c, '0123') === '1A1B' && feedbackText(c, '4567') === '0A1B',
    );
    expect(candidates.length).toBeGreaterThan(10);

    const worstOf = (guess: Code): number => {
      const buckets = new Map<string, number>();
      for (const c of candidates) {
        const key = feedbackText(c, guess);
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
      return Math.max(...buckets.values());
    };

    const chosen = chooseGuess(candidates);
    const bestPossible = Math.min(...ALL.map(worstOf));
    expect(worstOf(chosen)).toBe(bestPossible);
  }, SLOW);

  it('不合法的輸入直接拋錯', () => {
    expect(() => chooseGuess([])).toThrow();
    expect(() => chooseGuess(['1123'])).toThrow();
  });
});

describe('解完全部 5040 組密碼', () => {
  it('每一組都在 7 次內猜中', () => {
    // 解題是固定的，所以把全部密碼當成一棵決策樹走一遍，同一個節點只挑一次猜法
    let maxDepth = 0;
    let totalGuesses = 0;

    const walk = (candidates: readonly Code[], depth: number): void => {
      const guess = chooseGuess(candidates);
      const groups = new Map<string, Code[]>();
      for (const c of candidates) {
        const key = feedbackText(c, guess);
        const group = groups.get(key);
        if (group) group.push(c);
        else groups.set(key, [c]);
      }
      for (const [key, group] of groups) {
        if (key === '4A0B') {
          maxDepth = Math.max(maxDepth, depth);
          totalGuesses += depth;
        } else {
          walk(group, depth + 1);
        }
      }
    };

    walk(ALL, 1);
    expect(totalGuesses / ALL.length).toBeLessThan(5.6);
    expect(maxDepth).toBeLessThanOrEqual(7);
  }, 120_000);
});

describe('推理結果', () => {
  it('0A0B：讀出 4 個數字都不在答案裡，結論不重複列出', () => {
    const first = solved('4567')[0]!;
    expect(first.feedback).toEqual({ A: 0, B: 0 });
    expect(first.readings).toEqual([{ kind: 'none-present', digits: ['0', '1', '2', '3'] }]);
    for (const c of first.conclusions) {
      if (c.kind === 'excluded') expect(c.digits.some((d) => '0123'.includes(d))).toBe(false);
    }
  });

  it('0A1B：讀出恰好 1 個在答案裡，而且位置不對', () => {
    const first = solved('1456')[0]!;
    expect(first.feedback).toEqual({ A: 0, B: 1 });
    expect(first.readings).toEqual([
      { kind: 'some-present', digits: ['0', '1', '2', '3'], count: 1 },
      { kind: 'none-in-place', count: 1 },
    ]);
  });

  it('1A3B：讀出 4 個數字都在答案裡，其中 1 個位置正確', () => {
    const first = solved('0231')[0]!;
    expect(first.feedback).toEqual({ A: 1, B: 3 });
    expect(first.readings).toEqual([
      { kind: 'all-present', digits: ['0', '1', '2', '3'] },
      { kind: 'some-in-place', count: 1, misplaced: 3 },
    ]);
  });

  it('猜中的那一步只讀出猜中，沒有結論', () => {
    const last = solved('4721').at(-1)!;
    expect(last.readings).toEqual([{ kind: 'solved' }]);
    expect(last.conclusions).toEqual([]);
  });

  it(
    '每一條結論都與密碼相符',
    () => {
      const holds = (c: Conclusion, secret: Code): boolean => {
        switch (c.kind) {
          case 'excluded':
            return c.digits.every((d) => !secret.includes(d));
          case 'required':
            return c.digits.every((d) => secret.includes(d));
          case 'position-confirmed':
            return secret[c.position] === c.digit;
          case 'position-impossible':
            return c.digits.every((d) => secret[c.position] !== d);
          case 'only-one-left':
            return c.code === secret;
        }
      };

      let conclusionCount = 0;
      for (const secret of SAMPLE) {
        for (const step of solved(secret)) {
          for (const c of step.conclusions) {
            expect(holds(c, secret), `${secret} 第 ${step.index} 步：${JSON.stringify(c)}`).toBe(true);
            conclusionCount += 1;
          }
        }
      }
      expect(conclusionCount).toBeGreaterThan(0);
    },
    SLOW,
  );

  it(
    '只剩一種可能時，結論只列出那一組',
    () => {
      let seen = 0;
      for (const secret of SAMPLE) {
        for (const step of solved(secret)) {
          if (step.conclusions.some((c) => c.kind === 'only-one-left')) {
            expect(step.conclusions).toHaveLength(1);
            seen += 1;
          }
        }
      }
      expect(seen).toBeGreaterThan(0);
    },
    SLOW,
  );
});
