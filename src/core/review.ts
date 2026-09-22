import { allCodes, validateCode } from './codeGenerator';
import { judge } from './judge';
import { chooseGuess, solveCode, worstCase } from './solver';
import type { Code, Feedback, GuessRecord } from './types';

/**
 * 復盤：玩家猜完一局之後，回頭看每一步縮小了多少範圍，
 * 以及同樣情況下電腦會怎麼猜。
 *
 * 純邏輯，只回傳數字與組合；中文說明由 UI 層負責。
 *
 * 一般與惡魔模式都適用：惡魔會挑最刁難的回饋，但每一次回饋仍然與
 * 「所有仍可能的答案」一致，所以同一套候選過濾方式成立。
 */

/** 玩家的一次猜測，以及它和電腦的選擇比起來如何。 */
export interface ReviewStep {
  /** 第幾次猜，從 1 開始。 */
  readonly index: number;
  readonly guess: Code;
  readonly feedback: Feedback;
  /** 猜之前還有幾組可能 */
  readonly candidatesBefore: number;
  /** 猜完之後剩幾組可能 */
  readonly candidatesAfter: number;
  /** 你這組猜法最壞會剩幾組 */
  readonly worst: number;
  /** 猜的當下，這組本身還可不可能是答案 */
  readonly wasPossible: boolean;
  /** 同樣情況下電腦會猜哪一組 */
  readonly bestGuess: Code;
  /** 電腦那組最壞會剩幾組 */
  readonly bestWorst: number;
  /** 你的猜法和電腦一樣好（最壞情況相同） */
  readonly sameAsBest: boolean;
}

/** 一局的復盤結果。 */
export interface GameReview {
  readonly answer: Code;
  readonly steps: readonly ReviewStep[];
  readonly yourGuessCount: number;
  /** 電腦解同一組答案要幾次 */
  readonly solverGuessCount: number;
  /**
   * 和電腦差距最大的那一步（index，1 起算）；
   * 每一步都和電腦一樣好時為 null。
   */
  readonly biggestMissIndex: number | null;
}

/**
 * 依玩家的猜測紀錄與最後揭曉的答案產生復盤。
 *
 * records 必須是同一局、依序的猜測；answer 必須與每一次回饋一致
 * （放棄的局也適用，揭曉的答案同樣與所有回饋一致）。
 */
export function reviewGame(records: readonly GuessRecord[], answer: Code): GameReview {
  if (validateCode(answer) !== null) throw new Error(`reviewGame: 答案不合法（${answer}）`);

  let candidates: Code[] = allCodes();
  const steps: ReviewStep[] = [];

  for (const record of records) {
    const candidatesBefore = candidates.length;
    if (candidatesBefore === 0) throw new Error('reviewGame: 回饋前後矛盾，沒有任何可能的答案');

    const bestGuess = chooseGuess(candidates);
    const bestWorst = worstCase(bestGuess, candidates);
    const worst = worstCase(record.guess, candidates);
    const wasPossible = candidates.includes(record.guess);

    candidates = candidates.filter((code) => {
      const { A, B } = judge(code, record.guess);
      return A === record.feedback.A && B === record.feedback.B;
    });

    steps.push({
      index: record.index,
      guess: record.guess,
      feedback: record.feedback,
      candidatesBefore,
      candidatesAfter: candidates.length,
      worst,
      wasPossible,
      bestGuess,
      bestWorst,
      sameAsBest: worst === bestWorst,
    });
  }

  let biggestMissIndex: number | null = null;
  let biggestGap = 0;
  for (const step of steps) {
    const gap = step.worst - step.bestWorst;
    if (gap > biggestGap) {
      biggestGap = gap;
      biggestMissIndex = step.index;
    }
  }

  return {
    answer,
    steps,
    yourGuessCount: records.length,
    solverGuessCount: solveCode(answer).length,
    biggestMissIndex,
  };
}
