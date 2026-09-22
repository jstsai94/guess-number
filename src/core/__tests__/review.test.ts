import { describe, it, expect } from 'vitest';
import { allCodes } from '../codeGenerator';
import { judge } from '../judge';
import { reviewGame } from '../review';
import { solveCode } from '../solver';
import type { Code, GuessRecord } from '../types';

const SLOW = 60_000;

function recordsFor(answer: Code, guesses: readonly Code[]): GuessRecord[] {
  return guesses.map((guess, i) => ({ index: i + 1, guess, feedback: judge(answer, guess), at: 0 }));
}

describe('reviewGame 每一步的組數', () => {
  it(
    '從 5040 組開始，前後接得起來，猜中時只剩一組',
    () => {
      const answer = '4721';
      const review = reviewGame(recordsFor(answer, ['0123', '4567', '8901', answer]), answer);

      expect(review.steps).toHaveLength(4);
      expect(review.steps[0]!.candidatesBefore).toBe(allCodes().length);
      review.steps.forEach((step, i) => {
        expect(step.index).toBe(i + 1);
        expect(step.candidatesAfter).toBeLessThanOrEqual(step.candidatesBefore);
        const next = review.steps[i + 1];
        if (next) expect(next.candidatesBefore).toBe(step.candidatesAfter);
      });
      expect(review.steps.at(-1)!.candidatesAfter).toBe(1);
    },
    SLOW,
  );

  it(
    '你的最壞情況永遠不會比電腦的選擇好',
    () => {
      const answer = '0856';
      const review = reviewGame(recordsFor(answer, ['0123', '0145', '2856', answer]), answer);
      for (const step of review.steps) {
        expect(step.worst).toBeGreaterThanOrEqual(step.bestWorst);
        expect(step.sameAsBest).toBe(step.worst === step.bestWorst);
        expect(step.candidatesAfter).toBeLessThanOrEqual(step.worst);
      }
    },
    SLOW,
  );
});

describe('reviewGame 與電腦比較', () => {
  it(
    '照電腦的走法猜：每一步都一樣好，沒有可惜的一步',
    () => {
      const answer = '4721';
      const steps = solveCode(answer);
      const review = reviewGame(
        recordsFor(
          answer,
          steps.map((s) => s.guess),
        ),
        answer,
      );

      expect(review.yourGuessCount).toBe(review.solverGuessCount);
      expect(review.biggestMissIndex).toBeNull();
      for (const step of review.steps) {
        expect(step.sameAsBest).toBe(true);
        expect(step.bestGuess).toBe(step.guess);
      }
    },
    SLOW,
  );

  it(
    '亂猜時，最可惜的一步就是差距最大的那一步',
    () => {
      const answer = '4721';
      const review = reviewGame(recordsFor(answer, ['0123', '0132', '0213', answer]), answer);

      let worstGap = 0;
      let worstIndex: number | null = null;
      for (const step of review.steps) {
        const gap = step.worst - step.bestWorst;
        if (gap > worstGap) {
          worstGap = gap;
          worstIndex = step.index;
        }
      }
      expect(worstGap).toBeGreaterThan(0);
      expect(review.biggestMissIndex).toBe(worstIndex);
    },
    SLOW,
  );

  it('電腦次數就是解同一組答案的步數', () => {
    const answer = '3450';
    const review = reviewGame(recordsFor(answer, ['0123']), answer);
    expect(review.solverGuessCount).toBe(solveCode(answer).length);
  }, SLOW);
});

describe('reviewGame 其他情況', () => {
  it(
    '猜到已經不可能的組合時，wasPossible 為 false',
    () => {
      const answer = '4721';
      const first = '0123';
      const firstFeedback = judge(answer, first);
      // 與第一次回饋不一致的組合：猜它的當下已經不可能是答案
      const impossible = allCodes().find((code) => {
        const { A, B } = judge(code, first);
        return A !== firstFeedback.A || B !== firstFeedback.B;
      })!;

      const review = reviewGame(recordsFor(answer, [first, impossible]), answer);
      expect(review.steps[0]!.wasPossible).toBe(true);
      expect(review.steps[1]!.wasPossible).toBe(false);
    },
    SLOW,
  );

  it('一次都沒猜（放棄）：沒有步驟，也沒有可惜的一步', () => {
    const review = reviewGame([], '4721');
    expect(review.steps).toHaveLength(0);
    expect(review.yourGuessCount).toBe(0);
    expect(review.biggestMissIndex).toBeNull();
  }, SLOW);

  it('答案不合法直接拋錯', () => {
    expect(() => reviewGame([], '1123')).toThrow();
    expect(() => reviewGame([], '123')).toThrow();
  });
});
