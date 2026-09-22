import { allCodes, validateCode } from './codeGenerator';
import { judge } from './judge';
import type { Code, Feedback } from './types';

/**
 * 電腦解題：玩家出一組密碼，電腦用「最壞情況最少」的策略猜，
 * 並整理每一次回饋推出了什麼。
 *
 * 這裡只產生結構化的推理結果；中文說明由 UI 層負責。
 * 只支援預設規則（4 碼、數字不重複）。
 *
 * 這不是 Codemaker：出題的是玩家、猜的是電腦，和 GameSession 無關。
 */

/** 只看這一次回饋就能直接讀出的資訊。digits 依猜測的順序排列。 */
export type Reading =
  /** 4A0B，猜中 */
  | { readonly kind: 'solved' }
  /** A + B = 0：猜的 4 個數字都不在答案裡 */
  | { readonly kind: 'none-present'; readonly digits: readonly string[] }
  /** A + B = 4（但沒猜中）：答案就是這 4 個數字，只差順序 */
  | { readonly kind: 'all-present'; readonly digits: readonly string[] }
  /** 0 < A + B < 4：猜的 4 個數字裡恰好有 count 個在答案裡 */
  | { readonly kind: 'some-present'; readonly digits: readonly string[]; readonly count: number }
  /** A = 0：在答案裡的那 count 個數字，都不在這次猜的位置上 */
  | { readonly kind: 'none-in-place'; readonly count: number }
  /** 0 < A < 4：其中 count 個位置正確，misplaced 個位置不對 */
  | { readonly kind: 'some-in-place'; readonly count: number; readonly misplaced: number };

/** 結合之前所有回饋後，這一步「新」確定的結論。position 由 0 起算。 */
export type Conclusion =
  | { readonly kind: 'excluded'; readonly digits: readonly string[] }
  | { readonly kind: 'required'; readonly digits: readonly string[] }
  | { readonly kind: 'position-confirmed'; readonly position: number; readonly digit: string }
  | { readonly kind: 'position-impossible'; readonly position: number; readonly digits: readonly string[] }
  | { readonly kind: 'only-one-left'; readonly code: Code };

/** 猜了這組之後，某一種回饋會剩下幾組可能（猜中那一種剩 1 組）。 */
export interface GuessOutcome {
  readonly feedback: Feedback;
  readonly remaining: number;
}

/** 猜的某一個數字，在猜之前已知的狀態。 */
export interface GuessDigitRole {
  readonly digit: string;
  /** 放在第幾格，由 0 起算 */
  readonly position: number;
  readonly role:
    /** 已確定不在答案裡：只用來佔位置 */
    | 'excluded'
    /** 已確定在這一格：放在原位 */
    | 'confirmed-here'
    /** 已確定在別格：放在這裡只是佔位置 */
    | 'confirmed-elsewhere'
    /** 確定在答案裡但還不知道在哪一格：測試位置 */
    | 'known-present'
    /** 還不確定在不在答案裡：主要測試對象 */
    | 'unknown';
  /** 已確定在哪一格（confirmed-here／confirmed-elsewhere），否則 null */
  readonly confirmedPosition: number | null;
}

/** 為什麼猜這組：猜之前的判斷。 */
export interface GuessReason {
  /** opening：開局；last-one：只剩一種可能；strategy：依最壞情況最少挑選 */
  readonly kind: 'opening' | 'last-one' | 'strategy';
  /** 猜之前還有幾組可能 */
  readonly candidatesBefore: number;
  /** 這組本身是否還可能是答案 */
  readonly isCandidate: boolean;
  /** 每一種可能的回饋會剩下幾組，依組數由多到少 */
  readonly outcomes: readonly GuessOutcome[];
  /** 最壞情況剩幾組 */
  readonly worst: number;
  /** 平均剩幾組：各回饋出現的機率 × 剩下組數（= 平方和 ÷ 總組數） */
  readonly average: number;
  /** 這組不可能是答案時：如果只從可能的答案裡挑，最好的最壞情況是幾組；否則 null */
  readonly bestCandidateWorst: number | null;
  /** 猜的 4 個數字各自的狀態，依位置排列 */
  readonly digitRoles: readonly GuessDigitRole[];
}

/** 電腦的一次猜測。 */
export interface SolverStep {
  /** 第幾次猜，從 1 開始。 */
  readonly index: number;
  readonly guess: Code;
  readonly feedback: Feedback;
  readonly reason: GuessReason;
  readonly readings: readonly Reading[];
  /** 猜中的那一步沒有結論。 */
  readonly conclusions: readonly Conclusion[];
}

const CODE_LENGTH = 4;
const DIGIT_COUNT = 10;
/** 回饋編碼成 A * 5 + B，最大 4 * 5 + 0 = 20。 */
const FEEDBACK_KEYS = 25;
/** 保險用的上限；實際上所有密碼都在 7 次內猜中。 */
const MAX_STEPS = 10;

// ---------- 預先算好的查表（唯讀，不是遊戲狀態） ----------

const CODES: readonly Code[] = allCodes();
const INDEX_OF = new Map<Code, number>(CODES.map((code, i) => [code, i]));
const DIGITS = new Uint8Array(CODES.length * CODE_LENGTH);
const MASKS = new Uint16Array(CODES.length);
const POPCOUNT = new Uint8Array(1 << DIGIT_COUNT);

for (let mask = 1; mask < POPCOUNT.length; mask += 1) {
  POPCOUNT[mask] = (mask & 1) + POPCOUNT[mask >> 1]!;
}

CODES.forEach((code, i) => {
  let mask = 0;
  for (let p = 0; p < CODE_LENGTH; p += 1) {
    const digit = code.charCodeAt(p) - 48;
    DIGITS[i * CODE_LENGTH + p] = digit;
    mask |= 1 << digit;
  }
  MASKS[i] = mask;
});

/**
 * 兩組密碼互猜的回饋，編碼成 A * 5 + B。
 * 與 judge 結果相同但快得多（挑猜法時要算幾百萬次）；誰當答案結果都一樣。
 */
function feedbackKey(i: number, j: number): number {
  const bi = i * CODE_LENGTH;
  const bj = j * CODE_LENGTH;
  let a = 0;
  for (let p = 0; p < CODE_LENGTH; p += 1) {
    if (DIGITS[bi + p] === DIGITS[bj + p]) a += 1;
  }
  const common = POPCOUNT[MASKS[i]! & MASKS[j]!]!;
  return a * 5 + (common - a);
}

// ---------- 挑猜法：最壞情況最少 ----------

/**
 * 從全部 5040 組中挑下一次要猜的組合。
 *
 * 1. 最壞情況（各種回饋中剩下最多的那一種）越少越好
 * 2. 同分時，優先挑本身還可能是答案的組合（有機會直接猜中）
 * 3. 再同分時，各回饋剩餘組數的平方和越小越好（平均剩得少）
 * 4. 仍同分時取字典序最小的
 */
function chooseGuessIndex(candidates: readonly number[]): number {
  // 開局時所有猜法都等價（數字與位置對調後完全對稱），直接取 0123，省下兩千多萬次計算
  if (candidates.length === CODES.length) return 0;
  if (candidates.length === 1) return candidates[0]!;

  const isCandidate = new Uint8Array(CODES.length);
  for (const c of candidates) isCandidate[c] = 1;

  const counts = new Int32Array(FEEDBACK_KEYS);
  let best = -1;
  let bestWorst = Number.POSITIVE_INFINITY;
  let bestIsCandidate = false;
  let bestSpread = Number.POSITIVE_INFINITY;

  for (let g = 0; g < CODES.length; g += 1) {
    counts.fill(0);
    let worst = 0;
    let spread = 0;
    let pruned = false;

    for (const c of candidates) {
      const key = feedbackKey(g, c);
      const n = counts[key]! + 1;
      counts[key] = n;
      spread += 2 * n - 1; // n² − (n−1)²，累加起來就是平方和
      if (n > worst) {
        worst = n;
        // 最壞情況已經比目前最佳還差，不必再算下去
        if (worst > bestWorst) {
          pruned = true;
          break;
        }
      }
    }
    if (pruned) continue;

    const candidate = isCandidate[g] === 1;
    const better =
      worst < bestWorst ||
      (worst === bestWorst &&
        ((candidate && !bestIsCandidate) || (candidate === bestIsCandidate && spread < bestSpread)));

    if (better) {
      best = g;
      bestWorst = worst;
      bestIsCandidate = candidate;
      bestSpread = spread;
    }
  }

  return best;
}

/** 猜這一組時，最壞情況會剩下幾組（依目前仍可能的答案）。復盤用來比較玩家與電腦的選擇。 */
export function worstCase(guess: Code, candidates: readonly Code[]): number {
  const g = INDEX_OF.get(guess);
  if (g === undefined) throw new Error(`worstCase: 不合法的密碼（${guess}）`);
  if (candidates.length === 0) throw new Error('worstCase: 沒有任何可能的答案');
  const indices = candidates.map((code) => {
    const index = INDEX_OF.get(code);
    if (index === undefined) throw new Error(`worstCase: 不合法的密碼（${code}）`);
    return index;
  });
  return worstOf(g, indices, new Int32Array(FEEDBACK_KEYS));
}

/** 依目前仍可能的答案，挑出下一次要猜的組合。 */
export function chooseGuess(candidates: readonly Code[]): Code {
  if (candidates.length === 0) throw new Error('chooseGuess: 沒有任何可能的答案');
  const indices = candidates.map((code) => {
    const index = INDEX_OF.get(code);
    if (index === undefined) throw new Error(`chooseGuess: 不合法的密碼（${code}）`);
    return index;
  });
  return CODES[chooseGuessIndex(indices)]!;
}

// ---------- 推理 ----------

/** 由「所有仍可能的答案」統計出的確定知識。 */
interface Knowledge {
  readonly total: number;
  /** 含有數字 d 的可能答案有幾組 */
  readonly digitCount: Int32Array;
  /** 第 p 格是數字 d 的可能答案有幾組，索引 p * 10 + d */
  readonly positionCount: Int32Array;
}

function knowledgeOf(candidates: readonly number[]): Knowledge {
  const digitCount = new Int32Array(DIGIT_COUNT);
  const positionCount = new Int32Array(CODE_LENGTH * DIGIT_COUNT);
  for (const c of candidates) {
    for (let p = 0; p < CODE_LENGTH; p += 1) {
      const d = DIGITS[c * CODE_LENGTH + p]!;
      digitCount[d] = digitCount[d]! + 1;
      positionCount[p * DIGIT_COUNT + d] = positionCount[p * DIGIT_COUNT + d]! + 1;
    }
  }
  return { total: candidates.length, digitCount, positionCount };
}

const isExcluded = (k: Knowledge, d: number): boolean => k.digitCount[d] === 0;
const isRequired = (k: Knowledge, d: number): boolean => k.digitCount[d] === k.total;
const isConfirmed = (k: Knowledge, p: number, d: number): boolean => k.positionCount[p * DIGIT_COUNT + d] === k.total;
const isImpossible = (k: Knowledge, p: number, d: number): boolean => k.positionCount[p * DIGIT_COUNT + d] === 0;

function readFeedback(guess: Code, { A, B }: Feedback): Reading[] {
  if (A === CODE_LENGTH) return [{ kind: 'solved' }];

  const digits = [...guess];
  const present = A + B;
  if (present === 0) return [{ kind: 'none-present', digits }];

  const readings: Reading[] = [
    present === CODE_LENGTH ? { kind: 'all-present', digits } : { kind: 'some-present', digits, count: present },
  ];
  readings.push(A === 0 ? { kind: 'none-in-place', count: present } : { kind: 'some-in-place', count: A, misplaced: B });
  return readings;
}

/**
 * 比較這一步前後的確定知識，列出新確定的結論。
 * 被其他結論或直接讀出的資訊涵蓋的部分不重複列出。
 */
function concludeStep(
  before: Knowledge,
  after: Knowledge,
  readings: readonly Reading[],
  remaining: readonly number[],
): Conclusion[] {
  if (remaining.length === 1) return [{ kind: 'only-one-left', code: CODES[remaining[0]!]! }];

  const statedExcluded = new Set<string>();
  const statedRequired = new Set<string>();
  for (const reading of readings) {
    if (reading.kind === 'none-present') reading.digits.forEach((d) => statedExcluded.add(d));
    if (reading.kind === 'all-present') reading.digits.forEach((d) => statedRequired.add(d));
  }

  const conclusions: Conclusion[] = [];

  const excluded: string[] = [];
  for (let d = 0; d < DIGIT_COUNT; d += 1) {
    if (isExcluded(after, d) && !isExcluded(before, d) && !statedExcluded.has(String(d))) excluded.push(String(d));
  }
  if (excluded.length > 0) conclusions.push({ kind: 'excluded', digits: excluded });

  const confirmedDigits = new Set<number>();
  const confirmedPositions = new Set<number>();
  const newlyConfirmed: Conclusion[] = [];
  for (let p = 0; p < CODE_LENGTH; p += 1) {
    for (let d = 0; d < DIGIT_COUNT; d += 1) {
      if (!isConfirmed(after, p, d)) continue;
      confirmedDigits.add(d);
      confirmedPositions.add(p);
      if (!isConfirmed(before, p, d)) newlyConfirmed.push({ kind: 'position-confirmed', position: p, digit: String(d) });
    }
  }

  // 已經確定在哪一格的數字，「一定在答案裡」就不必另外說
  const required: string[] = [];
  for (let d = 0; d < DIGIT_COUNT; d += 1) {
    if (isRequired(after, d) && !isRequired(before, d) && !statedRequired.has(String(d)) && !confirmedDigits.has(d)) {
      required.push(String(d));
    }
  }
  if (required.length > 0) conclusions.push({ kind: 'required', digits: required });

  conclusions.push(...newlyConfirmed);

  // 已確定的格子不再列「不可能」；已排除的數字、已確定在別格的數字，本來就不可能出現在這一格
  for (let p = 0; p < CODE_LENGTH; p += 1) {
    if (confirmedPositions.has(p)) continue;
    const digits: string[] = [];
    for (let d = 0; d < DIGIT_COUNT; d += 1) {
      if (isImpossible(after, p, d) && !isImpossible(before, p, d) && !isExcluded(after, d) && !confirmedDigits.has(d)) {
        digits.push(String(d));
      }
    }
    if (digits.length > 0) conclusions.push({ kind: 'position-impossible', position: p, digits });
  }

  return conclusions;
}

// ---------- 為什麼猜這組 ----------

/** 猜 g 時最壞情況剩幾組；counts 為呼叫端提供的暫存陣列，會被覆寫。 */
function worstOf(g: number, candidates: readonly number[], counts: Int32Array): number {
  counts.fill(0);
  let worst = 0;
  for (const c of candidates) {
    const key = feedbackKey(g, c);
    const n = counts[key]! + 1;
    counts[key] = n;
    if (n > worst) worst = n;
  }
  return worst;
}

function explainGuess(g: number, candidates: readonly number[], before: Knowledge): GuessReason {
  const counts = new Int32Array(FEEDBACK_KEYS);
  const worst = worstOf(g, candidates, counts);

  const outcomes: GuessOutcome[] = [];
  let spread = 0;
  for (let key = 0; key < FEEDBACK_KEYS; key += 1) {
    const remaining = counts[key]!;
    if (remaining === 0) continue;
    spread += remaining * remaining;
    outcomes.push({ feedback: { A: Math.floor(key / 5), B: key % 5 }, remaining });
  }
  outcomes.sort((x, y) => y.remaining - x.remaining || y.feedback.A - x.feedback.A || y.feedback.B - x.feedback.B);

  const isCandidate = candidates.includes(g);
  let bestCandidateWorst: number | null = null;
  if (!isCandidate) {
    let best = Number.POSITIVE_INFINITY;
    for (const c of candidates) best = Math.min(best, worstOf(c, candidates, counts));
    bestCandidateWorst = best;
  }

  const digitRoles: GuessDigitRole[] = [];
  for (let p = 0; p < CODE_LENGTH; p += 1) {
    const d = DIGITS[g * CODE_LENGTH + p]!;
    let confirmedPosition: number | null = null;
    for (let q = 0; q < CODE_LENGTH; q += 1) {
      if (isConfirmed(before, q, d)) confirmedPosition = q;
    }
    const role: GuessDigitRole['role'] = isExcluded(before, d)
      ? 'excluded'
      : confirmedPosition === p
        ? 'confirmed-here'
        : confirmedPosition !== null
          ? 'confirmed-elsewhere'
          : isRequired(before, d)
            ? 'known-present'
            : 'unknown';
    digitRoles.push({ digit: String(d), position: p, role, confirmedPosition });
  }

  return {
    kind: candidates.length === CODES.length ? 'opening' : candidates.length === 1 ? 'last-one' : 'strategy',
    candidatesBefore: candidates.length,
    isCandidate,
    outcomes,
    worst,
    average: spread / candidates.length,
    bestCandidateWorst,
    digitRoles,
  };
}

// ---------- 解題 ----------

/**
 * 電腦猜出玩家的密碼，回傳完整的解題過程（最後一步必定是 4A0B）。
 * 解題過程是固定的：同一組密碼每次結果都一樣。
 */
export function solveCode(secret: Code): SolverStep[] {
  if (validateCode(secret) !== null) throw new Error(`solveCode: 密碼不合法（${secret}）`);

  let candidates: number[] = CODES.map((_, i) => i);
  let before = knowledgeOf(candidates);
  const steps: SolverStep[] = [];

  while (steps.length < MAX_STEPS) {
    const g = chooseGuessIndex(candidates);
    const guess = CODES[g]!;
    const feedback = judge(secret, guess);
    const key = feedback.A * 5 + feedback.B;
    const remaining = candidates.filter((c) => feedbackKey(g, c) === key);
    const after = knowledgeOf(remaining);
    const readings = readFeedback(guess, feedback);
    const solved = feedback.A === CODE_LENGTH;

    steps.push({
      index: steps.length + 1,
      guess,
      feedback,
      reason: explainGuess(g, candidates, before),
      readings,
      conclusions: solved ? [] : concludeStep(before, after, readings, remaining),
    });

    if (solved) return steps;
    candidates = remaining;
    before = after;
  }

  throw new Error(`solveCode: 超過 ${MAX_STEPS} 次仍未猜中（${secret}）`);
}
