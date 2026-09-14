import { describe, it, expect } from 'vitest';
import { DevilCodemaker } from '../DevilCodemaker';
import { GameSession } from '../GameSession';
import { allCodes, isValidCode } from '../codeGenerator';
import { judge } from '../judge';
import { DEFAULT_CONFIG } from '../types';
import type { Feedback } from '../types';
import { mulberry32 } from './helpers';

const key = (feedback: Feedback): string => `${feedback.A}A${feedback.B}B`;

/** 把候選依「對這次猜測會得到的回饋」分組，用來獨立驗證惡魔的選擇。 */
function partition(candidates: readonly string[], guess: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const code of candidates) {
    const k = key(judge(code, guess));
    const bucket = out.get(k);
    if (bucket) bucket.push(code);
    else out.set(k, [code]);
  }
  return out;
}

/** 開一局惡魔模式。 */
async function devil(seed = 1): Promise<DevilCodemaker> {
  const maker = new DevilCodemaker(mulberry32(seed));
  await maker.startGame(DEFAULT_CONFIG);
  return maker;
}

describe('DevilCodemaker 基本行為', () => {
  it('尚未 startGame 就呼叫 judge 或 reveal 會拒絕', async () => {
    const maker = new DevilCodemaker();
    await expect(maker.judge('0123')).rejects.toThrow();
    await expect(maker.reveal()).rejects.toThrow();
  });

  it('judge 收到不合法的猜測會拒絕', async () => {
    const maker = await devil();
    await expect(maker.judge('012')).rejects.toThrow();
    await expect(maker.judge('0012')).rejects.toThrow();
    await expect(maker.judge('01a3')).rejects.toThrow();
  });

  it('第一次猜 0123 必定回 0A1B（5040 組中最大的一組，共 1440 組）', async () => {
    expect(partition(allCodes(), '0123').get('0A1B')).toHaveLength(1440);

    for (const seed of [1, 2, 3, 42]) {
      expect(await (await devil(seed)).judge('0123')).toEqual({ A: 0, B: 1 });
    }
  });
});

describe('DevilCodemaker 惡魔策略', () => {
  it('每次都回傳「當下最大的那一組」的回饋', async () => {
    const maker = await devil(7);
    let candidates = allCodes();

    for (const guess of ['0123', '4567', '1845', '2961', '3708']) {
      const buckets = partition(candidates, guess);
      const feedback = await maker.judge(guess);

      const sizes = [...buckets]
        .filter(([k]) => buckets.size === 1 || k !== '4A0B')
        .map(([, codes]) => codes.length);
      const chosen = buckets.get(key(feedback))!;

      expect(chosen.length).toBe(Math.max(...sizes));
      candidates = chosen;
    }
  });

  it('候選不只一組時，絕不讓玩家猜中', async () => {
    const codes = allCodes();
    for (let i = 0; i < codes.length; i += 25) {
      const maker = await devil(i);
      expect(key(await maker.judge(codes[i]!))).not.toBe('4A0B');
    }
  });

  it('揭曉的答案與至今所有回饋一致（中途放棄也說得通）', async () => {
    for (const seed of [1, 5, 9, 13]) {
      const maker = await devil(seed);
      const history: Array<[string, Feedback]> = [];

      for (const guess of ['0123', '4567', '8901', '2345']) {
        history.push([guess, await maker.judge(guess)]);
      }

      const answer = await maker.reveal();
      for (const [guess, feedback] of history) {
        expect(judge(answer, guess)).toEqual(feedback);
      }
    }
  });

  it('開局就揭曉：回傳一組合法密碼', async () => {
    const answer = await (await devil(3)).reveal();
    expect(isValidCode(answer)).toBe(true);
  });

  it('reveal 重複呼叫結果固定', async () => {
    const maker = await devil(4);
    await maker.judge('0123');
    const first = await maker.reveal();
    for (let i = 0; i < 5; i += 1) expect(await maker.reveal()).toBe(first);
  });

  it('揭曉後不能再判定', async () => {
    const maker = await devil();
    await maker.judge('0123');
    await maker.reveal();
    await expect(maker.judge('4567')).rejects.toThrow();
  });

  it('重新 startGame 會重置候選與揭曉狀態', async () => {
    const maker = await devil(3);
    await maker.judge('0123');
    await maker.judge('4567');
    await maker.reveal();

    await maker.startGame(DEFAULT_CONFIG);
    // 回到 5040 組，行為與新開一局相同
    expect(await maker.judge('0123')).toEqual({ A: 0, B: 1 });
  });
});

describe('DevilCodemaker 決定性與隔離', () => {
  it('相同 seed 產生完全相同的回饋序列', async () => {
    const guesses = ['0123', '4567', '8901', '2345', '6789'];
    const a = await devil(99);
    const b = await devil(99);
    for (const guess of guesses) {
      expect(await a.judge(guess)).toEqual(await b.judge(guess));
    }
    expect(await a.reveal()).toBe(await b.reveal());
  });

  it('兩個實例互不干擾', async () => {
    const a = await devil(1);
    const b = await devil(1);
    await a.judge('0123');
    await a.judge('4567');

    expect(await b.judge('0123')).toEqual({ A: 0, B: 1 });
  });

  it('候選存於私有欄位，無法從外部列舉', async () => {
    const maker = await devil();
    await maker.judge('0123');
    expect(Object.keys(maker)).toEqual([]);
    expect(JSON.stringify(maker)).toBe('{}');
  });
});

describe('DevilCodemaker 搭配 GameSession', () => {
  it('「每次猜目前還可能的第一組」的玩家一定會贏，且不超過 10 次', async () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const game = await GameSession.create(new DevilCodemaker(mulberry32(seed)));
      let candidates = allCodes();

      while (game.status === 'playing' && game.guessCount < 12) {
        const guess = candidates[0]!;
        const result = await game.submitGuess(guess);
        if (!result.ok) throw new Error(`seed ${seed} 送出失敗：${result.reason}`);

        const feedbackKey = key(result.record.feedback);
        candidates = candidates.filter((c) => key(judge(c, guess)) === feedbackKey);
      }

      expect(game.status).toBe('won');
      expect(game.guessCount).toBeLessThanOrEqual(10);
      expect(await game.getAnswer()).toBe(game.guesses.at(-1)!.guess);
    }
  });

  it('透過 GameSession 第一次猜測也不會中', async () => {
    const game = await GameSession.create(new DevilCodemaker(mulberry32(1)));
    expect((await game.submitGuess('5970')).ok).toBe(true);
    expect(game.status).toBe('playing');
  });

  it('中途放棄時揭曉的答案與歷史紀錄全部一致', async () => {
    const game = await GameSession.create(new DevilCodemaker(mulberry32(11)));
    for (const guess of ['0123', '4567', '8912']) await game.submitGuess(guess);

    expect(game.surrender()).toBe(true);
    const answer = (await game.getAnswer())!;
    for (const record of game.guesses) {
      expect(judge(answer, record.guess)).toEqual(record.feedback);
    }
    expect(await game.getAnswer()).toBe(answer);
  });

  it('開局就放棄：揭曉一組合法答案', async () => {
    const game = await GameSession.create(new DevilCodemaker(mulberry32(2)));
    game.surrender();
    expect(isValidCode((await game.getAnswer())!)).toBe(true);
  });
});
