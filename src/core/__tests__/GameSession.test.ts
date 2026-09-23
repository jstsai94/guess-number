import { describe, it, expect } from 'vitest';
import type { Codemaker } from '../Codemaker';
import { GameSession } from '../GameSession';
import { LocalRandomCodemaker } from '../LocalRandomCodemaker';
import { ManualCodemaker, allValidCodes, flush, mulberry32, seededRng } from './helpers';

/** 建立一局答案固定為 '0123' 的遊戲，方便斷言。 */
function fixedSession(now?: () => number): Promise<GameSession> {
  const maker = new LocalRandomCodemaker(seededRng([0]));
  return GameSession.create(maker, now ? { now } : {});
}

describe('GameSession 基本流程', () => {
  it('建立時即開局，狀態為 playing 且沒有歷史', async () => {
    const game = await fixedSession();
    expect(game.status).toBe('playing');
    expect(game.guessCount).toBe(0);
    expect(game.guesses).toEqual([]);
    expect(game.isFinished).toBe(false);
    expect(game.isPaused).toBe(false);
  });

  it('猜錯時累積歷史，index 由 1 遞增', async () => {
    const game = await fixedSession();
    await game.submitGuess('4567');
    await game.submitGuess('8912');

    expect(game.guessCount).toBe(2);
    expect(game.guesses.map((r) => r.index)).toEqual([1, 2]);
    expect(game.guesses.map((r) => r.guess)).toEqual(['4567', '8912']);
    expect(game.guesses[0]!.feedback).toEqual({ A: 0, B: 0 });
    expect(game.guesses[1]!.feedback).toEqual({ A: 0, B: 2 });
  });

  it('submitGuess 成功時回傳該筆紀錄', async () => {
    const game = await fixedSession();
    const result = await game.submitGuess('0132');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.index).toBe(1);
      expect(result.record.guess).toBe('0132');
      expect(result.record.feedback).toEqual({ A: 2, B: 2 });
    }
  });

  it('猜中 4A0B 時狀態轉為 won', async () => {
    const game = await fixedSession();
    await game.submitGuess('4567');
    const result = await game.submitGuess('0123');

    expect(result.ok).toBe(true);
    expect(game.status).toBe('won');
    expect(game.isFinished).toBe(true);
    expect(game.guessCount).toBe(2);
  });
});

describe('GameSession 答案保護', () => {
  it('進行中 getAnswer() 一律解析為 null', async () => {
    const game = await fixedSession();
    expect(await game.getAnswer()).toBeNull();
    await game.submitGuess('4567');
    expect(await game.getAnswer()).toBeNull();
  });

  it('暫停中 getAnswer() 也解析為 null', async () => {
    const game = await fixedSession();
    game.pause();
    expect(await game.getAnswer()).toBeNull();
  });

  it('獲勝後才取得答案', async () => {
    const game = await fixedSession();
    await game.submitGuess('0123');
    expect(await game.getAnswer()).toBe('0123');
  });

  it('放棄後才取得答案', async () => {
    const game = await fixedSession();
    await game.submitGuess('4567');
    game.surrender();
    expect(await game.getAnswer()).toBe('0123');
  });

  it('實例上沒有可列舉的答案欄位', async () => {
    const game = await fixedSession();
    expect(Object.keys(game).sort()).toEqual(['config', 'id', 'notes', 'startedAt']);
  });
});

describe('GameSession 擋下不計次的輸入', () => {
  it('非法輸入被擋下且不計次', async () => {
    const game = await fixedSession();
    for (const bad of ['', '12', '12345', '1123', '12a4', '０１２３']) {
      const result = await game.submitGuess(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('invalid');
    }
    expect(game.guessCount).toBe(0);
    expect(game.guesses).toEqual([]);
  });

  it('重複猜測同一組被擋下且不計次', async () => {
    const game = await fixedSession();
    await game.submitGuess('4567');
    const again = await game.submitGuess('4567');

    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('duplicate');
    expect(game.guessCount).toBe(1);
  });

  it('hasGuessed 反映已猜過的組合，被擋下的輸入不會被記錄', async () => {
    const game = await fixedSession();
    expect(game.hasGuessed('4567')).toBe(false);
    await game.submitGuess('4567');
    expect(game.hasGuessed('4567')).toBe(true);

    await game.submitGuess('1123');
    expect(game.hasGuessed('1123')).toBe(false);
  });

  it('已結束的局不再接受猜測', async () => {
    const game = await fixedSession();
    await game.submitGuess('0123');
    const after = await game.submitGuess('4567');

    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.reason).toBe('finished');
    expect(game.guessCount).toBe(1);
  });

  it('guesses 回傳複本，外部改動不影響內部狀態', async () => {
    const game = await fixedSession();
    await game.submitGuess('4567');

    const snapshot = game.guesses as unknown as unknown[];
    snapshot.push({});
    snapshot.length = 0;

    expect(game.guessCount).toBe(1);
    expect(game.guesses[0]!.guess).toBe('4567');
  });
});

describe('GameSession 放棄規則', () => {
  it('開局還沒猜就可以放棄', async () => {
    const game = await fixedSession();
    expect(game.canSurrender).toBe(true);
    expect(game.surrender()).toBe(true);
    expect(game.status).toBe('surrendered');
    expect(game.guessCount).toBe(0);
  });

  it('猜到一半也可以放棄', async () => {
    const game = await fixedSession();
    await game.submitGuess('4567');
    await game.submitGuess('8912');

    expect(game.canSurrender).toBe(true);
    expect(game.surrender()).toBe(true);
    expect(game.status).toBe('surrendered');
    expect(game.guessCount).toBe(2);
  });

  it('獲勝後不能放棄', async () => {
    const game = await fixedSession();
    await game.submitGuess('0123');

    expect(game.canSurrender).toBe(false);
    expect(game.surrender()).toBe(false);
    expect(game.status).toBe('won');
  });

  it('放棄與獲勝是兩種不同的結束狀態', async () => {
    const won = await fixedSession();
    await won.submitGuess('0123');
    expect(won.status).toBe('won');

    const gaveUp = await fixedSession();
    gaveUp.surrender();
    expect(gaveUp.status).toBe('surrendered');
  });

  it('結束後不能再放棄，也不能反悔', async () => {
    const game = await fixedSession();
    expect(game.surrender()).toBe(true);
    expect(game.canSurrender).toBe(false);
    expect(game.surrender()).toBe(false);
    expect(game.status).toBe('surrendered');
    expect((await game.submitGuess('0123')).ok).toBe(false);
  });
});

describe('GameSession 暫停', () => {
  it('pause / resume 只在合理的時機成功', async () => {
    const game = await fixedSession();

    expect(game.resume()).toBe(false); // 沒在暫停，不能繼續
    expect(game.pause()).toBe(true);
    expect(game.isPaused).toBe(true);
    expect(game.pause()).toBe(false); // 已經暫停，不能再暫停
    expect(game.resume()).toBe(true);
    expect(game.isPaused).toBe(false);
  });

  it('暫停中送出猜測會被擋下且不計次', async () => {
    const game = await fixedSession();
    game.pause();

    const result = await game.submitGuess('0123');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('paused');
    expect(game.guessCount).toBe(0);
    expect(game.hasGuessed('0123')).toBe(false);
    expect(game.status).toBe('playing');
  });

  it('暫停優先：暫停中連非法輸入也回報 paused', async () => {
    const game = await fixedSession();
    game.pause();

    const result = await game.submitGuess('1123');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('paused');
  });

  it('繼續之後可以正常猜測', async () => {
    const game = await fixedSession();
    game.pause();
    game.resume();

    expect((await game.submitGuess('4567')).ok).toBe(true);
    expect((await game.submitGuess('0123')).ok).toBe(true);
    expect(game.status).toBe('won');
  });

  it('暫停期間不計入用時', async () => {
    let t = 0;
    const game = await fixedSession(() => t);
    await game.submitGuess('4567'); // 計時從第一次送出開始

    t = 1000;
    expect(game.elapsedMs).toBe(1000);

    game.pause();
    t = 5000;
    expect(game.elapsedMs).toBe(1000); // 暫停中凍結

    game.resume();
    t = 5500;
    expect(game.elapsedMs).toBe(1500);
  });

  it('多次暫停的時間會累計扣除', async () => {
    let t = 0;
    const game = await fixedSession(() => t);
    await game.submitGuess('4567');

    t = 100;
    game.pause();
    t = 600;
    game.resume(); // 暫停 500

    t = 700;
    game.pause();
    t = 1700;
    game.resume(); // 暫停 1000

    t = 2000;
    expect(game.elapsedMs).toBe(2000 - 1500);
  });

  it('猜中時的用時不含暫停時間，且結束後固定', async () => {
    let t = 0;
    const game = await fixedSession(() => t);
    await game.submitGuess('4567');

    t = 1000;
    game.pause();
    t = 4000;
    game.resume();

    t = 5000;
    await game.submitGuess('0123');
    expect(game.status).toBe('won');
    expect(game.elapsedMs).toBe(2000);

    t = 99999;
    expect(game.elapsedMs).toBe(2000);
  });

  it('暫停中可以放棄，用時結算到暫停開始的那一刻', async () => {
    let t = 0;
    const game = await fixedSession(() => t);
    await game.submitGuess('4567');

    t = 3000;
    game.pause();
    t = 8000;

    expect(game.surrender()).toBe(true);
    expect(game.status).toBe('surrendered');
    expect(game.isPaused).toBe(false);
    expect(game.finishedAt).toBe(8000);
    expect(game.elapsedMs).toBe(3000);

    t = 20000;
    expect(game.elapsedMs).toBe(3000);
  });

  it('已結束的局不能暫停', async () => {
    const game = await fixedSession();
    await game.submitGuess('0123');

    expect(game.pause()).toBe(false);
    expect(game.isPaused).toBe(false);
  });

  it('兩局的暫停互不影響', async () => {
    const a = await fixedSession();
    const b = await fixedSession();
    a.pause();

    expect(a.isPaused).toBe(true);
    expect(b.isPaused).toBe(false);
    expect((await b.submitGuess('4567')).ok).toBe(true);
    expect((await a.submitGuess('4567')).ok).toBe(false);
  });
});

describe('GameSession 計時', () => {
  it('第一次送出之前不計時', async () => {
    let t = 1000;
    const game = await fixedSession(() => t);

    expect(game.startedAt).toBe(1000);
    expect(game.finishedAt).toBeNull();

    t = 9000;
    expect(game.elapsedMs).toBe(0);
  });

  it('一次都還沒猜就放棄，用時是 0', async () => {
    let t = 1000;
    const game = await fixedSession(() => t);

    t = 8000;
    expect(game.surrender()).toBe(true);
    expect(game.elapsedMs).toBe(0);
  });

  it('計時從第一次送出開始，進行中以當下時間計算，結束後固定', async () => {
    let t = 1000;
    const game = await fixedSession(() => t);

    t = 4000;
    await game.submitGuess('4567'); // 計時起點

    t = 4500;
    expect(game.elapsedMs).toBe(500);

    t = 6000;
    await game.submitGuess('0123');
    expect(game.status).toBe('won');
    expect(game.finishedAt).toBe(6000);

    t = 99999;
    expect(game.elapsedMs).toBe(2000);
  });

  it('第一次送出之前的暫停不影響計時', async () => {
    let t = 0;
    const game = await fixedSession(() => t);

    game.pause();
    t = 5000;
    game.resume();

    t = 6000;
    await game.submitGuess('4567');
    t = 6800;
    expect(game.elapsedMs).toBe(800);
  });

  it('每一次猜測都記下當下的用時，不含暫停', async () => {
    let t = 500;
    const game = await fixedSession(() => t);

    await game.submitGuess('4567'); // 計時起點
    t = 1500;
    await game.submitGuess('4568');

    game.pause();
    t = 3500;
    game.resume(); // 暫停 2000

    t = 4000;
    await game.submitGuess('0123'); // 猜中

    expect(game.guesses.map((r) => r.elapsedMs)).toEqual([0, 1000, 1500]);
    expect(game.guesses.map((r) => r.at)).toEqual([500, 1500, 4000]);
    expect(game.elapsedMs).toBe(1500);
  });
});

describe('GameSession 非同步判定（為連線對戰準備）', () => {
  it('create 會等 startGame 完成才回傳', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const inner = new LocalRandomCodemaker(seededRng([0]));
    let started = false;
    const slowStart: Codemaker = {
      startGame: async (config) => {
        await gate;
        await inner.startGame(config);
        started = true;
      },
      judge: (guess) => inner.judge(guess),
      reveal: () => inner.reveal(),
    };

    let created: GameSession | null = null;
    const creating = GameSession.create(slowStart).then((game) => {
      created = game;
    });

    await flush();
    expect(started).toBe(false);
    expect(created).toBeNull();

    release();
    await creating;
    expect(started).toBe(true);
    expect(created).not.toBeNull();
  });

  it('判定還沒回來時再送出，會以 pending 擋下且不計次', async () => {
    const maker = new ManualCodemaker('0123');
    const game = await GameSession.create(maker);

    const first = game.submitGuess('4567');
    expect(maker.pendingCount).toBe(1);

    const second = await game.submitGuess('8912');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('pending');
    expect(maker.pendingCount).toBe(1); // 沒有送出第二次判定

    maker.resolveNext();
    expect((await first).ok).toBe(true);
    expect(game.guessCount).toBe(1);
    expect(game.hasGuessed('8912')).toBe(false);

    // 上一次判定完成後就能繼續送
    const third = game.submitGuess('8912');
    maker.resolveNext();
    expect((await third).ok).toBe(true);
    expect(game.guessCount).toBe(2);
  });

  it('判定期間放棄：晚到的結果作廢，不會寫進歷史', async () => {
    const maker = new ManualCodemaker('0123');
    const game = await GameSession.create(maker);

    const pending = game.submitGuess('0123'); // 這一組其實會中
    expect(game.surrender()).toBe(true);
    maker.resolveNext();

    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('finished');
    expect(game.status).toBe('surrendered'); // 不會因為晚到的 4A0B 變成 won
    expect(game.guessCount).toBe(0);
  });

  it('判定失敗時例外往外拋；那組數字不計次、沒被記為已猜過，可以重送', async () => {
    const maker = new ManualCodemaker('0123');
    const game = await GameSession.create(maker);

    const failing = game.submitGuess('4567');
    maker.rejectNext(new Error('網路中斷'));
    await expect(failing).rejects.toThrow('網路中斷');

    expect(game.guessCount).toBe(0);
    expect(game.hasGuessed('4567')).toBe(false);

    const retry = game.submitGuess('4567');
    maker.resolveNext();
    expect((await retry).ok).toBe(true);
    expect(game.guessCount).toBe(1);
  });

  it('判定期間暫停：結果回來仍會記錄，因為猜測是在暫停前送出的', async () => {
    const maker = new ManualCodemaker('0123');
    const game = await GameSession.create(maker);

    const pending = game.submitGuess('4567');
    expect(game.pause()).toBe(true);
    maker.resolveNext();

    expect((await pending).ok).toBe(true);
    expect(game.guessCount).toBe(1);
    expect(game.isPaused).toBe(true);
  });

  it('兩局可以同時等待判定，互不阻擋', async () => {
    const makerA = new ManualCodemaker('0123');
    const makerB = new ManualCodemaker('4567');
    const gameA = await GameSession.create(makerA);
    const gameB = await GameSession.create(makerB);

    const pendingA = gameA.submitGuess('8912');
    const pendingB = gameB.submitGuess('8912');
    expect(makerA.pendingCount).toBe(1);
    expect(makerB.pendingCount).toBe(1);

    makerB.resolveNext();
    expect((await pendingB).ok).toBe(true);
    expect(gameB.guessCount).toBe(1);
    expect(gameA.guessCount).toBe(0); // A 還在等

    makerA.resolveNext();
    expect((await pendingA).ok).toBe(true);
    expect(gameA.guessCount).toBe(1);
  });
});

describe('GameSession 多局並存（雙人對戰前置驗證）', () => {
  it('兩局同時進行，狀態互不干擾', async () => {
    const left = await GameSession.create(new LocalRandomCodemaker(seededRng([0])));
    const right = await GameSession.create(new LocalRandomCodemaker(seededRng([0.999999])));

    await left.submitGuess('4567');
    await left.submitGuess('8912');
    await right.submitGuess('0123');

    expect(left.guessCount).toBe(2);
    expect(right.guessCount).toBe(1);
    expect(left.hasGuessed('4567')).toBe(true);
    expect(right.hasGuessed('4567')).toBe(false);

    await right.submitGuess('9012');
    expect(right.status).toBe('won');
    expect(left.status).toBe('playing');
    expect(await left.getAnswer()).toBeNull();
    expect(await right.getAnswer()).toBe('9012');
  });

  it('每一局都有自己的 id', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i += 1) ids.add((await fixedSession()).id);
    expect(ids.size).toBe(100);
  });

  it('每一局都有自己的筆記，互不干擾', async () => {
    const left = await fixedSession();
    const right = await fixedSession();

    left.notes.cycleMark('7');
    left.notes.setPositionMark('7', 2, 'confirmed');

    expect(left.notes.getMark('7')).toBe('excluded');
    expect(right.notes.getMark('7')).toBe('unknown');
    expect(right.notes.getPositionMark('7', 2)).toBe('possible');
  });

  it('可指定 config 覆寫預設規則', async () => {
    const game = await GameSession.create(new LocalRandomCodemaker(mulberry32(5)), {
      config: { codeLength: 5 },
    });
    expect(game.config).toEqual({ codeLength: 5, allowDuplicateDigits: false });
    expect((await game.submitGuess('0123')).ok).toBe(false);
    expect((await game.submitGuess('01234')).ok).toBe(true);
  });
});

describe('GameSession 隨機對局壓力測試', () => {
  // 約 25 萬次 submitGuess。實測在較慢的機器上約 5 秒，剛好卡在 Vitest 預設的 5 秒上限；
  // 第二期 A 改動前的版本同樣會逾時，屬於既有的時間預算不足，不是效能退化。
  // 因此只放寬這一個測試的上限，測試量與內容維持不變。
  it('100 局隨機亂猜到底，狀態與歷史始終自洽', async () => {
    const rng = mulberry32(20260912);
    const codes = allValidCodes();

    for (let n = 0; n < 100; n += 1) {
      const game = await GameSession.create(new LocalRandomCodemaker(rng));
      const order = [...codes].sort(() => rng() - 0.5);

      for (const guess of order) {
        const before = game.guessCount;
        const result = await game.submitGuess(guess);
        expect(result.ok).toBe(true);
        expect(game.guessCount).toBe(before + 1);
        if (game.status !== 'playing') break;
      }

      expect(game.status).toBe('won');

      const last = game.guesses.at(-1)!;
      expect(last.feedback).toEqual({ A: 4, B: 0 });
      expect(last.guess).toBe(await game.getAnswer());
      expect(game.guesses.map((r) => r.index)).toEqual(game.guesses.map((_, i) => i + 1));
      expect(new Set(game.guesses.map((r) => r.guess)).size).toBe(game.guessCount);
    }
  }, 30_000);
});
