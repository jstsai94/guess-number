import type { Feedback, MatchReason, VersusPlayer } from '../core';
import { decideMatch, judge, verifyFeedbackHistory } from '../core';
import { commitHash, createSalt, verifyCommit } from './commitment';
import { getFirebase } from './firebase';
import { loadSecret, saveSecret, type LocalSecret } from './localSecret';
import type { OpponentLink } from './OpponentCodemaker';
import {
  commitSecret,
  claimIdOf,
  markSurrendered,
  publishReveal,
  sendGuess,
  touch,
  watchRoom,
  writeClaim,
  writeFeedback,
  type ClaimType,
  type RoomState,
} from './room';

/**
 * 一場「互相出題」對戰的控制器。
 *
 * 把 room.ts 的即時資料接起來，負責畫面上看不到、但對戰必須發生的事：
 * - 自動替對手判定（用只存在本機的密碼）
 * - 心跳
 * - 發現逾時時提出申訴（由伺服器驗證）
 * - 勝負確定後公開自己的密碼，並核對雙方的雜湊與每一次回饋
 * - 依相同資料推導勝負（core/versus.ts），雙方結果一致
 *
 * 所有狀態都在這個控制器實例內，一場對戰一個實例。
 */

const HEARTBEAT_MS = 20_000;
const TICK_MS = 5_000;
const TIMEOUT_MS = 60_000;
/** 用本機時鐘預估是否已逾時；多留一點緩衝，伺服器判定條件未成立時會拒絕，下一輪再試。 */
const CLAIM_MARGIN_MS = 3_000;

export type MatchPhase = 'waiting' | 'setting' | 'playing' | 'finished' | 'cancelled';
export type Verification = 'pending' | 'ok' | 'me-cheated' | 'opponent-cheated' | 'both-cheated';

export interface SideView {
  readonly uid: string;
  readonly committed: boolean;
  readonly surrendered: boolean;
  /** 已完成判定的猜測次數。 */
  readonly guessCount: number;
  readonly solved: boolean;
  /** 猜中那一次「送出」時距離對戰開始的毫秒數；未猜中為 null。 */
  readonly solvedElapsedMs: number | null;
  /** 這一方送出的猜測，依送出順序；feedback 為 null 表示還在等對方判定。 */
  readonly guesses: ReadonlyArray<{ readonly guess: string; readonly feedback: Feedback | null }>;
}

export interface MatchOutcome {
  readonly winner: 'me' | 'opponent' | 'draw';
  readonly reason: MatchReason;
}

export interface MatchView {
  readonly roomCode: string;
  readonly phase: MatchPhase;
  readonly me: SideView;
  readonly opponent: SideView | null;
  /** 對戰開始的伺服器時間（雙方寫入雜湊中較晚的一個）。 */
  readonly startedAtMs: number | null;
  readonly outcome: MatchOutcome | null;
  readonly verification: Verification;
  readonly revealed: { readonly me: string | null; readonly opponent: string | null };
  /** 對戰已開始，但這個分頁找不到自己的密碼（例如換了分頁），無法替對手判定。 */
  readonly secretMissing: boolean;
  /** 自己設定的密碼，只用來顯示在自己的畫面上；不會送到任何地方。 */
  readonly mySecret: string | null;
}

export interface VersusMatch {
  readonly roomCode: string;
  readonly uid: string;
  /** 交給 OpponentCodemaker 使用。 */
  readonly link: OpponentLink;
  onUpdate(listener: (view: MatchView) => void): () => void;
  onError(listener: (error: Error) => void): () => void;
  /** 設定自己的密碼：產生鹽、只把雜湊寫進資料庫，密碼與鹽留在本機。 */
  commit(code: string): Promise<void>;
  surrender(): Promise<void>;
  close(): void;
}

interface Summary {
  readonly view: SideView;
  readonly solvedCreatedAtMs: number | null;
}

export async function openMatch(roomCode: string): Promise<VersusMatch> {
  const { db, uid } = await getFirebase();

  let secret: LocalSecret | null = loadSecret(roomCode);
  let latest: RoomState | null = null;
  let closed = false;
  let revealing = false;

  const updateListeners = new Set<(view: MatchView) => void>();
  const errorListeners = new Set<(error: Error) => void>();
  const waiters = new Set<{ attempt: (s: RoomState) => boolean; reject: (e: Error) => void }>();
  const judging = new Set<string>();
  const claiming = new Set<string>();
  const verifying = new Set<string>();
  /** uid → 公開的密碼是否通過核對。 */
  const verified = new Map<string, boolean>();

  // ---------- 推導 ----------

  const opponentOf = (s: RoomState): string | null => {
    if (!s.room) return null;
    return s.room.hostUid === uid ? s.room.guestUid : s.room.hostUid;
  };

  function summarize(s: RoomState, who: string): Summary {
    const sent = s.guesses.filter((g) => g.from === who).sort((a, b) => a.index - b.index);
    const judged = sent.filter((g) => g.feedback !== null);
    const solving = judged.find((g) => g.feedback!.A === 4) ?? null;
    const player = s.players.get(who);
    return {
      view: {
        uid: who,
        committed: Boolean(player?.commitHash),
        surrendered: Boolean(player?.surrendered),
        guessCount: judged.length,
        solved: solving !== null,
        // 需要雙方的開始時間才能計算，由 buildView 補上
        solvedElapsedMs: null,
        guesses: sent.map((g) => ({ guess: g.guess, feedback: g.feedback })),
      },
      solvedCreatedAtMs: solving?.createdAt?.toMillis() ?? null,
    };
  }

  function toPlayer(s: RoomState, who: string, summary: Summary, startedAtMs: number | null): VersusPlayer {
    return {
      guessCount: summary.view.guessCount,
      solved: summary.view.solved,
      solvedElapsedMs:
        summary.solvedCreatedAtMs !== null && startedAtMs !== null ? summary.solvedCreatedAtMs - startedAtMs : null,
      surrendered: summary.view.surrendered,
      disconnected: s.claims.has(claimIdOf('disconnect', who)),
      judgeTimedOut: s.claims.has(claimIdOf('judge-timeout', who)),
      cheated: verified.get(who) === false || s.claims.has(claimIdOf('no-reveal', who)),
    };
  }

  function buildView(s: RoomState): MatchView {
    const opp = opponentOf(s);
    const me = summarize(s, uid);
    const them = opp ? summarize(s, opp) : null;

    const committedTimes = [s.players.get(uid)?.committedAt, opp ? s.players.get(opp)?.committedAt : null];
    const startedAtMs =
      committedTimes[0] && committedTimes[1]
        ? Math.max(committedTimes[0].toMillis(), committedTimes[1].toMillis())
        : null;

    const withElapsed = (summary: Summary): SideView => ({
      ...summary.view,
      solvedElapsedMs:
        summary.solvedCreatedAtMs !== null && startedAtMs !== null
          ? summary.solvedCreatedAtMs - startedAtMs
          : null,
    });

    let phase: MatchPhase;
    if (!s.room) phase = 'cancelled';
    else if (!opp || !them) phase = 'waiting';
    else if (!me.view.committed || !them.view.committed) phase = 'setting';
    else phase = 'playing';

    let outcome: MatchOutcome | null = null;
    if (opp && them && (phase === 'playing' || phase === 'setting')) {
      const result = decideMatch(toPlayer(s, uid, me, startedAtMs), toPlayer(s, opp, them, startedAtMs));
      // 設定密碼階段只接受「斷線」造成的結束（對手加入後就消失）
      const endsNow = result.finished && (phase === 'playing' || result.reason === 'disconnect');
      if (result.finished && endsNow) {
        phase = 'finished';
        outcome = {
          winner: result.winner === 'a' ? 'me' : result.winner === 'b' ? 'opponent' : 'draw',
          reason: result.reason,
        };
      }
    }

    const cheatedMe = verified.get(uid) === false || s.claims.has(claimIdOf('no-reveal', uid));
    const cheatedThem = opp ? verified.get(opp) === false || s.claims.has(claimIdOf('no-reveal', opp)) : false;
    let verification: Verification = 'pending';
    if (cheatedMe && cheatedThem) verification = 'both-cheated';
    else if (cheatedMe) verification = 'me-cheated';
    else if (cheatedThem) verification = 'opponent-cheated';
    else if (verified.get(uid) === true && opp && verified.get(opp) === true) verification = 'ok';

    return {
      roomCode,
      phase,
      me: withElapsed(me),
      opponent: them ? withElapsed(them) : null,
      startedAtMs,
      outcome,
      verification,
      revealed: {
        me: s.reveals.get(uid)?.code ?? null,
        opponent: opp ? (s.reveals.get(opp)?.code ?? null) : null,
      },
      secretMissing: me.view.committed && secret === null,
      mySecret: secret?.code ?? null,
    };
  }

  // ---------- 副作用 ----------

  function autoJudge(s: RoomState): void {
    if (!secret) return;
    for (const g of s.guesses) {
      if (g.to !== uid || g.feedback !== null || judging.has(g.id)) continue;
      judging.add(g.id);
      writeFeedback(db, roomCode, g.id, judge(secret.code, g.guess)).catch((error: unknown) => {
        judging.delete(g.id); // 下一次狀態更新時重試
        reportError(error);
      });
    }
  }

  function revealIfFinished(s: RoomState, view: MatchView): void {
    if (view.phase !== 'finished' || !secret || !s.room || s.reveals.has(uid) || revealing) return;
    revealing = true;
    publishReveal(db, roomCode, uid, { ...secret, expiresAt: s.room.expiresAt }).catch((error: unknown) => {
      revealing = false;
      reportError(error);
    });
  }

  function verifyReveals(s: RoomState): void {
    for (const [who, reveal] of s.reveals) {
      if (verified.has(who) || verifying.has(who)) continue;
      const hash = s.players.get(who)?.commitHash;
      if (!hash) continue;

      verifying.add(who);
      const history = s.guesses
        .filter((g) => g.to === who && g.feedback !== null)
        .map((g) => ({ guess: g.guess, feedback: g.feedback! }));

      void verifyCommit(reveal.code, reveal.salt, hash).then((hashOk) => {
        verified.set(who, hashOk && verifyFeedbackHistory(reveal.code, history).ok);
        verifying.delete(who);
        if (latest) emit(latest);
      });
    }
  }

  function claim(s: RoomState, type: ClaimType, against: string, guessId: string | null): void {
    const id = claimIdOf(type, against);
    if (!s.room || claiming.has(id) || s.claims.has(id)) return;
    claiming.add(id);
    writeClaim(db, roomCode, { type, claimant: uid, against, guessId, expiresAt: s.room.expiresAt }).catch(() => {
      // 伺服器判定時間條件尚未成立（本機時鐘略快），下一輪再試
      claiming.delete(id);
    });
  }

  function checkTimeouts(): void {
    const s = latest;
    if (!s || !s.room) return;
    const opp = opponentOf(s);
    if (!opp) return;

    const view = buildView(s);
    const now = Date.now() - CLAIM_MARGIN_MS;
    const olderThanTimeout = (ms: number | undefined): boolean => ms !== undefined && now - ms > TIMEOUT_MS;

    if (view.phase === 'setting' || view.phase === 'playing') {
      if (olderThanTimeout(s.players.get(opp)?.lastSeen?.toMillis())) claim(s, 'disconnect', opp, null);
    }

    if (view.phase === 'playing') {
      const stale = s.guesses.find(
        (g) => g.from === uid && g.feedback === null && olderThanTimeout(g.createdAt?.toMillis()),
      );
      if (stale) claim(s, 'judge-timeout', opp, stale.id);
    }

    const myReveal = s.reveals.get(uid);
    if (myReveal && !s.reveals.has(opp) && olderThanTimeout(myReveal.createdAt?.toMillis())) {
      claim(s, 'no-reveal', opp, null);
    }
  }

  function emit(s: RoomState): void {
    const view = buildView(s);
    revealIfFinished(s, view);
    for (const listener of updateListeners) listener(view);
  }

  function reportError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    for (const listener of errorListeners) listener(err);
  }

  function handleState(s: RoomState): void {
    if (closed) return;
    latest = s;
    autoJudge(s);
    verifyReveals(s);
    emit(s);
    for (const waiter of [...waiters]) {
      if (waiter.attempt(s)) waiters.delete(waiter);
    }
  }

  // ---------- 等待 ----------

  function waitFor<T>(pick: (s: RoomState) => T | undefined): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const attempt = (s: RoomState): boolean => {
        const value = pick(s);
        if (value === undefined) return false;
        resolve(value);
        return true;
      };
      if (latest && attempt(latest)) return;
      waiters.add({ attempt, reject });
    });
  }

  const link: OpponentLink = {
    waitForStart: () =>
      waitFor((s) => {
        const opp = opponentOf(s);
        return opp && s.players.get(uid)?.commitHash && s.players.get(opp)?.commitHash ? true : undefined;
      }).then(() => undefined),

    sendGuess: async (guess) => {
      const s = latest;
      const opp = s ? opponentOf(s) : null;
      if (!s || !s.room || !opp) throw new Error('對戰尚未開始');
      const index = s.guesses.filter((g) => g.from === uid).length + 1;
      return sendGuess(db, roomCode, { from: uid, to: opp, index, guess, expiresAt: s.room.expiresAt });
    },

    waitForFeedback: (guessId) => waitFor((s) => s.guesses.find((g) => g.id === guessId)?.feedback ?? undefined),

    waitForReveal: () =>
      waitFor((s) => {
        const opp = opponentOf(s);
        return opp ? s.reveals.get(opp)?.code : undefined;
      }),
  };

  // ---------- 啟動 ----------

  const unsubscribe = watchRoom(db, roomCode, handleState, reportError);
  const heartbeat = setInterval(() => void touch(db, roomCode, uid).catch(reportError), HEARTBEAT_MS);
  const ticker = setInterval(checkTimeouts, TICK_MS);
  void touch(db, roomCode, uid).catch(reportError);

  return {
    roomCode,
    uid,
    link,

    onUpdate(listener) {
      updateListeners.add(listener);
      if (latest) listener(buildView(latest));
      return () => updateListeners.delete(listener);
    },

    onError(listener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },

    async commit(code) {
      const previous = secret;
      const salt = createSalt();
      const next: LocalSecret = { code, salt };
      // 先存本機再寫雜湊：萬一寫完雜湊就重新整理，本機仍找得到密碼
      secret = next;
      saveSecret(roomCode, next);
      try {
        await commitSecret(db, roomCode, uid, await commitHash(code, salt));
      } catch (error) {
        secret = previous;
        if (previous) saveSecret(roomCode, previous);
        throw error;
      }
    },

    async surrender() {
      await markSurrendered(db, roomCode, uid);
    },

    close() {
      if (closed) return;
      closed = true;
      unsubscribe();
      clearInterval(heartbeat);
      clearInterval(ticker);
      for (const waiter of waiters) waiter.reject(new Error('對戰已關閉'));
      waiters.clear();
      updateListeners.clear();
      errorListeners.clear();
    },
  };
}
