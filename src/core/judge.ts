import type { Code, Feedback } from './types';

/**
 * 純函式判定：比對答案與猜測，回傳 A / B 數。
 *
 * A = 數字相同且位置相同的個數
 * B = 數字存在於答案中但位置不同的個數
 *
 * 不修改任何輸入，也不持有任何狀態。
 */
export function judge(answer: Code, guess: Code): Feedback {
  if (answer.length !== guess.length) {
    throw new Error(`judge: 長度不一致 answer=${answer.length} guess=${guess.length}`);
  }

  let A = 0;
  let B = 0;

  // 答案中每個數字出現的次數（僅計入位置不相符的部分）
  const answerRemaining = new Map<string, number>();
  const unmatchedGuess: string[] = [];

  for (let i = 0; i < answer.length; i += 1) {
    const a = answer[i]!;
    const g = guess[i]!;
    if (a === g) {
      A += 1;
    } else {
      answerRemaining.set(a, (answerRemaining.get(a) ?? 0) + 1);
      unmatchedGuess.push(g);
    }
  }

  for (const g of unmatchedGuess) {
    const left = answerRemaining.get(g) ?? 0;
    if (left > 0) {
      B += 1;
      answerRemaining.set(g, left - 1);
    }
  }

  return { A, B };
}
