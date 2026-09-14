import { describe, it, expect } from 'vitest';
import { decideMatch, verifyFeedbackHistory } from '../versus';
import type { VersusPlayer } from '../versus';
import { judge } from '../judge';

/** 預設為「還在猜、沒有任何狀況」的玩家，只覆寫測試關心的欄位。 */
function player(overrides: Partial<VersusPlayer> = {}): VersusPlayer {
  return {
    guessCount: 0,
    solved: false,
    solvedElapsedMs: null,
    surrendered: false,
    disconnected: false,
    judgeTimedOut: false,
    cheated: false,
    ...overrides,
  };
}

const solved = (guessCount: number, solvedElapsedMs: number): VersusPlayer =>
  player({ guessCount, solved: true, solvedElapsedMs });

describe('decideMatch 雙方都猜中', () => {
  it('次數少者勝', () => {
    expect(decideMatch(solved(5, 90_000), solved(7, 30_000))).toEqual({
      finished: true,
      winner: 'a',
      reason: 'fewer-guesses',
    });
  });

  it('次數相同，用時短者勝', () => {
    expect(decideMatch(solved(6, 120_000), solved(6, 80_000))).toEqual({
      finished: true,
      winner: 'b',
      reason: 'faster',
    });
  });

  it('次數與用時都相同為平手', () => {
    expect(decideMatch(solved(6, 80_000), solved(6, 80_000))).toEqual({
      finished: true,
      winner: 'draw',
      reason: 'exact-tie',
    });
  });
});

describe('decideMatch 一方先猜中', () => {
  it('另一方次數還沒達到：比賽繼續', () => {
    expect(decideMatch(solved(5, 60_000), player({ guessCount: 4 }))).toEqual({ finished: false });
  });

  it('另一方次數達到仍未猜中：提前判負（下一次最快也會多一次）', () => {
    expect(decideMatch(solved(5, 60_000), player({ guessCount: 5 }))).toEqual({
      finished: true,
      winner: 'a',
      reason: 'reached-limit',
    });
  });

  it('另一方在同樣次數猜中：改比用時', () => {
    expect(decideMatch(player({ guessCount: 5 }), solved(5, 60_000))).toEqual({
      finished: true,
      winner: 'b',
      reason: 'reached-limit',
    });
    expect(decideMatch(solved(5, 70_000), solved(5, 60_000))).toEqual({
      finished: true,
      winner: 'b',
      reason: 'faster',
    });
  });
});

describe('decideMatch 棄權', () => {
  it('雙方都沒猜中也沒狀況：比賽繼續', () => {
    expect(decideMatch(player({ guessCount: 3 }), player({ guessCount: 8 }))).toEqual({ finished: false });
  });

  it('放棄的一方判負', () => {
    expect(decideMatch(player({ surrendered: true }), player())).toEqual({
      finished: true,
      winner: 'b',
      reason: 'surrender',
    });
  });

  it('連線中斷的一方判負', () => {
    expect(decideMatch(player(), player({ disconnected: true }))).toEqual({
      finished: true,
      winner: 'a',
      reason: 'disconnect',
    });
  });

  it('判定逾時的一方判負，即使自己已經猜中', () => {
    expect(decideMatch(solved(3, 20_000), player({ guessCount: 1 }))).toEqual({ finished: false });
    expect(
      decideMatch(player({ ...solved(3, 20_000), judgeTimedOut: true }), player({ guessCount: 1 })),
    ).toEqual({ finished: true, winner: 'b', reason: 'judge-timeout' });
  });

  it('已經猜中後的「放棄」旗標不算棄權', () => {
    expect(decideMatch(player({ ...solved(4, 30_000), surrendered: true }), player({ guessCount: 4 }))).toEqual({
      finished: true,
      winner: 'a',
      reason: 'reached-limit',
    });
  });

  it('雙方都棄權為平手', () => {
    expect(decideMatch(player({ surrendered: true }), player({ disconnected: true }))).toEqual({
      finished: true,
      winner: 'draw',
      reason: 'both-forfeited',
    });
  });

  it('棄權優先於猜中比較：先猜中的一方斷線，仍判斷線方負', () => {
    expect(decideMatch(player({ ...solved(3, 10_000), disconnected: true }), solved(4, 5_000))).toEqual({
      finished: true,
      winner: 'b',
      reason: 'disconnect',
    });
  });
});

describe('decideMatch 作弊', () => {
  it('核對失敗的一方判負，推翻原本的勝負', () => {
    expect(decideMatch(player({ ...solved(3, 10_000), cheated: true }), solved(9, 90_000))).toEqual({
      finished: true,
      winner: 'b',
      reason: 'cheated',
    });
  });

  it('作弊優先於棄權', () => {
    expect(decideMatch(player({ surrendered: true }), player({ cheated: true }))).toEqual({
      finished: true,
      winner: 'a',
      reason: 'cheated',
    });
  });

  it('雙方都作弊為平手', () => {
    expect(decideMatch(player({ cheated: true }), player({ cheated: true }))).toEqual({
      finished: true,
      winner: 'draw',
      reason: 'both-cheated',
    });
  });
});

describe('decideMatch 對稱性', () => {
  it('交換雙方位置，勝方也跟著交換', () => {
    const cases: Array<[VersusPlayer, VersusPlayer]> = [
      [solved(5, 90_000), solved(7, 30_000)],
      [solved(6, 120_000), solved(6, 80_000)],
      [solved(5, 60_000), player({ guessCount: 5 })],
      [player({ surrendered: true }), player()],
      [player({ cheated: true }), solved(2, 1_000)],
    ];
    const flip = (w: string): string => (w === 'a' ? 'b' : w === 'b' ? 'a' : w);

    for (const [x, y] of cases) {
      const forward = decideMatch(x, y);
      const backward = decideMatch(y, x);
      expect(forward.finished).toBe(backward.finished);
      if (forward.finished && backward.finished) {
        expect(backward.winner).toBe(flip(forward.winner));
        expect(backward.reason).toBe(forward.reason);
      }
    }
  });
});

describe('verifyFeedbackHistory', () => {
  const code = '4721';
  const honest = ['0123', '5678', '4712', '4721'].map((guess) => ({ guess, feedback: judge(code, guess) }));

  it('全部屬實時通過', () => {
    expect(verifyFeedbackHistory(code, honest)).toEqual({ ok: true });
  });

  it('沒有任何猜測時通過', () => {
    expect(verifyFeedbackHistory(code, [])).toEqual({ ok: true });
  });

  it('其中一次回報不實：指出是第幾筆', () => {
    const lied = honest.map((h, i) => (i === 2 ? { ...h, feedback: { A: 0, B: 0 } } : h));
    expect(verifyFeedbackHistory(code, lied)).toEqual({ ok: false, problem: 'false-feedback', index: 2 });
  });

  it('只要有一個數字不對就算不實（A 對、B 錯也不行）', () => {
    const truth = judge(code, '0123');
    const lied = [{ guess: '0123', feedback: { A: truth.A, B: truth.B + 1 } }];
    expect(verifyFeedbackHistory(code, lied)).toEqual({ ok: false, problem: 'false-feedback', index: 0 });
  });

  it('公開的密碼本身不合法：核對失敗', () => {
    expect(verifyFeedbackHistory('1123', honest)).toEqual({ ok: false, problem: 'invalid-code' });
    expect(verifyFeedbackHistory('12a4', [])).toEqual({ ok: false, problem: 'invalid-code' });
  });
});
