import { describe, it, expect } from 'vitest';
import { GameSession, SURRENDER_THRESHOLD } from '../GameSession';
import { LocalRandomCodemaker } from '../LocalRandomCodemaker';
import { allValidCodes, mulberry32, seededRng } from './helpers';

/** 建立一局答案固定為 '0123' 的遊戲，方便斷言。 */
function fixedSession(now?: () => number): GameSession {
  const maker = new LocalRandomCodemaker(seededRng([0]));
  return new GameSession(maker, now ? { now } : {});
}

/** 取出 n 組不重複、且不等於答案的合法猜測。 */
function wrongGuesses(n: number, answer = '0123'): string[] {
  return allValidCodes()
    .filter((c) => c !== answer)
    .slice(0, n);
}

describe('GameSession 基本流程', () => {
  it('建立時即開局，狀態為 playing 且沒有歷史', () => {
    const game = fixedSession();
    expect(game.status).toBe('playing');
    expect(game.guessCount).toBe(0);
    expect(game.guesses).toEqual([]);
    expect(game.isFinished).toBe(false);
  });

  it('猜錯時累積歷史，index 由 1 遞增', () => {
    const game = fixedSession();
    game.submitGuess('4567');
    game.submitGuess('8912');

    expect(game.guessCount).toBe(2);
    expect(game.guesses.map((r) => r.index)).toEqual([1, 2]);
    expect(game.guesses.map((r) => r.guess)).toEqual(['4567', '8912']);
    expect(game.guesses[0]!.feedback).toEqual({ A: 0, B: 0 });
    expect(game.guesses[1]!.feedback).toEqual({ A: 0, B: 2 });
  });

  it('submitGuess 成功時回傳該筆紀錄', () => {
    const game = fixedSession();
    const result = game.submitGuess('0132');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.index).toBe(1);
      expect(result.record.guess).toBe('0132');
      expect(result.record.feedback).toEqual({ A: 2, B: 2 });
    }
  });

  it('猜中 4A0B 時狀態轉為 won', () => {
    const game = fixedSession();
    game.submitGuess('4567');
    const result = game.submitGuess('0123');

    expect(result.ok).toBe(true);
    expect(game.status).toBe('won');
    expect(game.isFinished).toBe(true);
    expect(game.guessCount).toBe(2);
  });
});

describe('GameSession 答案保護', () => {
  it('進行中 getAnswer() 一律回傳 null', () => {
    const game = fixedSession();
    expect(game.getAnswer()).toBeNull();
    game.submitGuess('4567');
    expect(game.getAnswer()).toBeNull();
  });

  it('獲勝後才取得答案', () => {
    const game = fixedSession();
    game.submitGuess('0123');
    expect(game.getAnswer()).toBe('0123');
  });

  it('放棄後才取得答案', () => {
    const game = fixedSession();
    for (const g of wrongGuesses(SURRENDER_THRESHOLD)) game.submitGuess(g);
    game.surrender();
    expect(game.getAnswer()).toBe('0123');
  });

  it('實例上沒有可列舉的答案欄位', () => {
    const game = fixedSession();
    expect(Object.keys(game).sort()).toEqual(['config', 'id', 'notes', 'startedAt']);
  });
});

describe('GameSession 擋下不計次的輸入', () => {
  it('非法輸入被擋下且不計次', () => {
    const game = fixedSession();
    for (const bad of ['', '12', '12345', '1123', '12a4', '０１２３']) {
      const result = game.submitGuess(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('invalid');
    }
    expect(game.guessCount).toBe(0);
    expect(game.guesses).toEqual([]);
  });

  it('重複猜測同一組被擋下且不計次', () => {
    const game = fixedSession();
    game.submitGuess('4567');
    const again = game.submitGuess('4567');

    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('duplicate');
    expect(game.guessCount).toBe(1);
  });

  it('hasGuessed 反映已猜過的組合，被擋下的輸入不會被記錄', () => {
    const game = fixedSession();
    expect(game.hasGuessed('4567')).toBe(false);
    game.submitGuess('4567');
    expect(game.hasGuessed('4567')).toBe(true);

    game.submitGuess('1123');
    expect(game.hasGuessed('1123')).toBe(false);
  });

  it('已結束的局不再接受猜測', () => {
    const game = fixedSession();
    game.submitGuess('0123');
    const after = game.submitGuess('4567');

    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.reason).toBe('finished');
    expect(game.guessCount).toBe(1);
  });

  it('guesses 回傳複本，外部改動不影響內部狀態', () => {
    const game = fixedSession();
    game.submitGuess('4567');

    const snapshot = game.guesses as unknown as unknown[];
    snapshot.push({});
    snapshot.length = 0;

    expect(game.guessCount).toBe(1);
    expect(game.guesses[0]!.guess).toBe('4567');
  });
});

describe('GameSession 放棄規則', () => {
  it('第 10 次猜測之前不可放棄', () => {
    const game = fixedSession();
    const guesses = wrongGuesses(SURRENDER_THRESHOLD);

    expect(game.canSurrender).toBe(false);
    for (let i = 0; i < SURRENDER_THRESHOLD - 1; i += 1) {
      game.submitGuess(guesses[i]!);
      expect(game.canSurrender).toBe(false);
      expect(game.surrender()).toBe(false);
      expect(game.status).toBe('playing');
    }
    expect(game.guessCount).toBe(SURRENDER_THRESHOLD - 1);
  });

  it('第 10 次猜測結束後才可放棄', () => {
    const game = fixedSession();
    for (const g of wrongGuesses(SURRENDER_THRESHOLD)) game.submitGuess(g);

    expect(game.guessCount).toBe(SURRENDER_THRESHOLD);
    expect(game.canSurrender).toBe(true);
    expect(game.surrender()).toBe(true);
    expect(game.status).toBe('surrendered');
  });

  it('不計次的輸入不會讓放棄提前解鎖', () => {
    const game = fixedSession();
    for (let i = 0; i < 20; i += 1) game.submitGuess('1123');
    for (let i = 0; i < 20; i += 1) game.submitGuess('4567');

    expect(game.guessCount).toBe(1);
    expect(game.canSurrender).toBe(false);
  });

  it('放棄與獲勝是兩種不同的結束狀態', () => {
    const won = fixedSession();
    won.submitGuess('0123');
    expect(won.status).toBe('won');

    const gaveUp = fixedSession();
    for (const g of wrongGuesses(SURRENDER_THRESHOLD)) gaveUp.submitGuess(g);
    gaveUp.surrender();
    expect(gaveUp.status).toBe('surrendered');
  });

  it('結束後不能再放棄，也不能反悔', () => {
    const game = fixedSession();
    for (const g of wrongGuesses(SURRENDER_THRESHOLD)) game.submitGuess(g);
    expect(game.surrender()).toBe(true);
    expect(game.canSurrender).toBe(false);
    expect(game.surrender()).toBe(false);
    expect(game.status).toBe('surrendered');
  });
});

describe('GameSession 計時', () => {
  it('進行中以當下時間計算，結束後固定', () => {
    let t = 1000;
    const game = fixedSession(() => t);

    expect(game.startedAt).toBe(1000);
    expect(game.finishedAt).toBeNull();

    t = 1500;
    expect(game.elapsedMs).toBe(500);

    t = 3000;
    game.submitGuess('0123');
    expect(game.status).toBe('won');
    expect(game.finishedAt).toBe(3000);

    t = 9999;
    expect(game.elapsedMs).toBe(2000);
  });
});

describe('GameSession 多局並存（雙人對戰前置驗證）', () => {
  it('兩局同時進行，狀態互不干擾', () => {
    const left = new GameSession(new LocalRandomCodemaker(seededRng([0])));
    const right = new GameSession(new LocalRandomCodemaker(seededRng([0.999999])));

    left.submitGuess('4567');
    left.submitGuess('8912');
    right.submitGuess('0123');

    expect(left.guessCount).toBe(2);
    expect(right.guessCount).toBe(1);
    expect(left.hasGuessed('4567')).toBe(true);
    expect(right.hasGuessed('4567')).toBe(false);

    right.submitGuess('9012');
    expect(right.status).toBe('won');
    expect(left.status).toBe('playing');
    expect(left.getAnswer()).toBeNull();
    expect(right.getAnswer()).toBe('9012');
  });

  it('每一局都有自己的 id', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i += 1) ids.add(fixedSession().id);
    expect(ids.size).toBe(100);
  });

  it('每一局都有自己的筆記，互不干擾', () => {
    const left = fixedSession();
    const right = fixedSession();

    left.notes.cycleMark('7');
    left.notes.setPositionMark('7', 2, 'confirmed');

    expect(left.notes.getMark('7')).toBe('excluded');
    expect(right.notes.getMark('7')).toBe('unknown');
    expect(right.notes.getPositionMark('7', 2)).toBe('possible');
  });

  it('可指定 config 覆寫預設規則', () => {
    const game = new GameSession(new LocalRandomCodemaker(mulberry32(5)), {
      config: { codeLength: 5 },
    });
    expect(game.config).toEqual({ codeLength: 5, allowDuplicateDigits: false });
    expect(game.submitGuess('0123').ok).toBe(false);
    expect(game.submitGuess('01234').ok).toBe(true);
  });
});

describe('GameSession 隨機對局壓力測試', () => {
  it('100 局隨機亂猜到底，狀態與歷史始終自洽', () => {
    const rng = mulberry32(20260912);
    const codes = allValidCodes();

    for (let n = 0; n < 100; n += 1) {
      const game = new GameSession(new LocalRandomCodemaker(rng));
      const order = [...codes].sort(() => rng() - 0.5);

      for (const guess of order) {
        const before = game.guessCount;
        const result = game.submitGuess(guess);
        expect(result.ok).toBe(true);
        expect(game.guessCount).toBe(before + 1);
        if (game.status !== 'playing') break;
      }

      expect(game.status).toBe('won');

      const last = game.guesses.at(-1)!;
      expect(last.feedback).toEqual({ A: 4, B: 0 });
      expect(last.guess).toBe(game.getAnswer());
      expect(game.guesses.map((r) => r.index)).toEqual(game.guesses.map((_, i) => i + 1));
      expect(new Set(game.guesses.map((r) => r.guess)).size).toBe(game.guessCount);
    }
  });
});
