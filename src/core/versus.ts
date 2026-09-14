import type { Feedback } from './types';
import { isValidCode } from './codeGenerator';
import { judge } from './judge';

/**
 * 連線對戰的勝負規則（純函式，不依賴 Firebase）。
 *
 * 雙方裝置拿同一份房間資料、跑同一個函式，得到的結果必定一致，
 * 所以不需要由誰「寫入勝負」。
 */

/** 對戰中一位玩家的狀態，由房間資料整理而來。 */
export interface VersusPlayer {
  /** 已完成判定的猜測次數（還在等判定的不算）。 */
  readonly guessCount: number;
  /** 是否已猜中。 */
  readonly solved: boolean;
  /** 猜中那一次「送出」時距離對戰開始的毫秒數；未猜中為 null。 */
  readonly solvedElapsedMs: number | null;
  readonly surrendered: boolean;
  /** 超過 60 秒沒有心跳。 */
  readonly disconnected: boolean;
  /** 對手的猜測超過 60 秒沒有被這位玩家判定。 */
  readonly judgeTimedOut: boolean;
  /** 結束後核對失敗（回報不實，或沒有公開密碼）。 */
  readonly cheated: boolean;
}

export type MatchSide = 'a' | 'b';

export type MatchReason =
  /** 雙方都猜中，次數較少 */
  | 'fewer-guesses'
  /** 雙方次數相同，用時較短 */
  | 'faster'
  /** 次數與用時都相同 */
  | 'exact-tie'
  /** 一方先猜中，另一方次數已達到仍未猜中 */
  | 'reached-limit'
  | 'surrender'
  | 'disconnect'
  | 'judge-timeout'
  | 'cheated'
  | 'both-forfeited'
  | 'both-cheated';

export type MatchResult =
  | { readonly finished: false }
  | { readonly finished: true; readonly winner: MatchSide | 'draw'; readonly reason: MatchReason };

const ONGOING: MatchResult = { finished: false };

/** 這位玩家是否已經棄權；回傳原因，沒有則為 null。 */
function forfeitReason(p: VersusPlayer): 'disconnect' | 'judge-timeout' | 'surrender' | null {
  if (p.disconnected) return 'disconnect';
  // 就算自己已經猜中，也必須持續替對手判定，否則對手會被卡住
  if (p.judgeTimedOut) return 'judge-timeout';
  if (p.surrendered && !p.solved) return 'surrender';
  return null;
}

/** 依雙方狀態推導勝負。 */
export function decideMatch(a: VersusPlayer, b: VersusPlayer): MatchResult {
  // 1. 作弊最優先
  if (a.cheated || b.cheated) {
    if (a.cheated && b.cheated) return { finished: true, winner: 'draw', reason: 'both-cheated' };
    return { finished: true, winner: a.cheated ? 'b' : 'a', reason: 'cheated' };
  }

  // 2. 棄權（放棄、斷線、判定逾時）
  const forfeitA = forfeitReason(a);
  const forfeitB = forfeitReason(b);
  if (forfeitA && forfeitB) return { finished: true, winner: 'draw', reason: 'both-forfeited' };
  if (forfeitA) return { finished: true, winner: 'b', reason: forfeitA };
  if (forfeitB) return { finished: true, winner: 'a', reason: forfeitB };

  // 3. 雙方都猜中：先比次數，再比用時
  if (a.solved && b.solved) {
    if (a.guessCount !== b.guessCount) {
      return { finished: true, winner: a.guessCount < b.guessCount ? 'a' : 'b', reason: 'fewer-guesses' };
    }
    const ta = a.solvedElapsedMs ?? Number.POSITIVE_INFINITY;
    const tb = b.solvedElapsedMs ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return { finished: true, winner: ta < tb ? 'a' : 'b', reason: 'faster' };
    return { finished: true, winner: 'draw', reason: 'exact-tie' };
  }

  // 4. 一方先猜中：另一方次數已經達到，下一次最快也會多一次，勝負已定
  const solvedSide: MatchSide | null = a.solved ? 'a' : b.solved ? 'b' : null;
  if (solvedSide) {
    const winner = solvedSide === 'a' ? a : b;
    const chaser = solvedSide === 'a' ? b : a;
    if (chaser.guessCount >= winner.guessCount) {
      return { finished: true, winner: solvedSide, reason: 'reached-limit' };
    }
  }

  return ONGOING;
}

export type FeedbackCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly problem: 'invalid-code' }
  | { readonly ok: false; readonly problem: 'false-feedback'; readonly index: number };

/**
 * 結束後核對：公開的密碼是否合法，以及過去每一次回饋是否屬實。
 * 雜湊是否相符屬於網路層（Web Crypto），不在這裡檢查。
 */
export function verifyFeedbackHistory(
  code: string,
  history: ReadonlyArray<{ readonly guess: string; readonly feedback: Feedback }>,
): FeedbackCheck {
  if (!isValidCode(code)) return { ok: false, problem: 'invalid-code' };
  for (let i = 0; i < history.length; i += 1) {
    const { guess, feedback } = history[i]!;
    const truth = judge(code, guess);
    if (truth.A !== feedback.A || truth.B !== feedback.B) {
      return { ok: false, problem: 'false-feedback', index: i };
    }
  }
  return { ok: true };
}
