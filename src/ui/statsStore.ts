import type { GameStatus } from '../core';
import type { Difficulty } from './difficulty';

export interface Stats {
  /** 總局數：勝利與放棄都算。 */
  total: number;
  /** 勝場，與放棄分開計算。 */
  wins: number;
  /** 最佳紀錄（最少猜測次數），只看勝場；沒有紀錄時為 null。 */
  bestGuessCount: number | null;
}

/**
 * 第二期之前只有一種難度，統計存在這個 key。
 * 現在把它視為「一般」模式的統計；不刪除，只在一般模式還沒有新紀錄時讀取。
 */
const LEGACY_KEY = 'guess-number:stats:v1';

const storageKey = (difficulty: Difficulty): string => `guess-number:stats:v2:${difficulty}`;

export const EMPTY_STATS: Stats = { total: 0, wins: 0, bestGuessCount: null };

/**
 * 讀取某個難度的統計。
 *
 * localStorage 在無痕視窗、封鎖網站資料等情境會讀不到甚至丟例外，
 * 所以全部包在 try/catch 裡，失敗時回到空統計而不是讓整頁掛掉。
 */
export function loadStats(difficulty: Difficulty): Stats {
  try {
    let raw = localStorage.getItem(storageKey(difficulty));
    if (raw === null && difficulty === 'normal') {
      raw = localStorage.getItem(LEGACY_KEY);
    }
    if (!raw) return { ...EMPTY_STATS };

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY_STATS };

    const record = parsed as Record<string, unknown>;
    return {
      total: toCount(record['total']),
      wins: toCount(record['wins']),
      bestGuessCount: toBest(record['bestGuessCount']),
    };
  } catch {
    return { ...EMPTY_STATS };
  }
}

/** 記錄一局的結果並回傳該難度更新後的統計。 */
export function recordResult(
  difficulty: Difficulty,
  outcome: Exclude<GameStatus, 'playing'>,
  guessCount: number,
): Stats {
  const current = loadStats(difficulty);

  const next: Stats = {
    total: current.total + 1,
    wins: current.wins + (outcome === 'won' ? 1 : 0),
    bestGuessCount:
      outcome === 'won' && (current.bestGuessCount === null || guessCount < current.bestGuessCount)
        ? guessCount
        : current.bestGuessCount,
  };

  try {
    localStorage.setItem(storageKey(difficulty), JSON.stringify(next));
  } catch {
    // 寫不進去就只回傳當下的數字，不影響遊玩
  }

  return next;
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function toBest(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}
