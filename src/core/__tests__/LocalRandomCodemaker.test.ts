import { describe, it, expect } from 'vitest';
import { LocalRandomCodemaker } from '../LocalRandomCodemaker';
import { isValidCode } from '../codeGenerator';
import { judge } from '../judge';
import { DEFAULT_CONFIG } from '../types';
import { mulberry32, seededRng } from './helpers';

describe('LocalRandomCodemaker', () => {
  it('三個方法都回傳 Promise（符合非同步介面）', async () => {
    const maker = new LocalRandomCodemaker(seededRng([0]));
    const started = maker.startGame(DEFAULT_CONFIG);
    expect(started).toBeInstanceOf(Promise);
    await started;

    const judged = maker.judge('4567');
    const revealed = maker.reveal();
    expect(judged).toBeInstanceOf(Promise);
    expect(revealed).toBeInstanceOf(Promise);
    await Promise.all([judged, revealed]);
  });

  it('startGame 後 reveal() 回傳一組合法答案', async () => {
    const maker = new LocalRandomCodemaker();
    await maker.startGame(DEFAULT_CONFIG);
    expect(isValidCode(await maker.reveal(), DEFAULT_CONFIG)).toBe(true);
  });

  it('注入 rng 時答案可預期', async () => {
    const maker = new LocalRandomCodemaker(seededRng([0]));
    await maker.startGame(DEFAULT_CONFIG);
    expect(await maker.reveal()).toBe('0123');
  });

  it('尚未 startGame 就呼叫 judge 或 reveal 會拒絕', async () => {
    const maker = new LocalRandomCodemaker();
    await expect(maker.reveal()).rejects.toThrow();
    await expect(maker.judge('1234')).rejects.toThrow();
  });

  it('judge 的結果與純函式 judge(reveal(), guess) 一致', async () => {
    const maker = new LocalRandomCodemaker(mulberry32(7));
    await maker.startGame(DEFAULT_CONFIG);
    const answer = await maker.reveal();
    for (const guess of ['0123', '4567', '8901', '1234', answer]) {
      expect(await maker.judge(guess)).toEqual(judge(answer, guess));
    }
  });

  it('猜中答案時回傳 4A0B', async () => {
    const maker = new LocalRandomCodemaker(seededRng([0]));
    await maker.startGame(DEFAULT_CONFIG);
    expect(await maker.judge(await maker.reveal())).toEqual({ A: 4, B: 0 });
  });

  it('judge 收到不合法的猜測會拒絕', async () => {
    const maker = new LocalRandomCodemaker();
    await maker.startGame(DEFAULT_CONFIG);
    await expect(maker.judge('112')).rejects.toThrow();
    await expect(maker.judge('1123')).rejects.toThrow();
    await expect(maker.judge('12a4')).rejects.toThrow();
  });

  it('重新 startGame 會換一組新答案', async () => {
    const maker = new LocalRandomCodemaker(mulberry32(99));
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      await maker.startGame(DEFAULT_CONFIG);
      seen.add(await maker.reveal());
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('答案在整局之中保持固定（一般模式，不是惡魔模式）', async () => {
    const maker = new LocalRandomCodemaker(mulberry32(3));
    await maker.startGame(DEFAULT_CONFIG);
    const answer = await maker.reveal();
    for (const guess of ['0123', '4567', '8912', '3456']) await maker.judge(guess);
    expect(await maker.reveal()).toBe(answer);
  });

  it('兩個獨立實例互不干擾', async () => {
    const a = new LocalRandomCodemaker(seededRng([0]));
    const b = new LocalRandomCodemaker(seededRng([0.999999]));
    await a.startGame(DEFAULT_CONFIG);
    await b.startGame(DEFAULT_CONFIG);
    expect(await a.reveal()).toBe('0123');
    expect(await b.reveal()).toBe('9012');

    await b.startGame(DEFAULT_CONFIG);
    expect(await a.reveal()).toBe('0123');
  });

  it('答案存於私有欄位，無法從實例外部列舉出來', async () => {
    const maker = new LocalRandomCodemaker(seededRng([0]));
    await maker.startGame(DEFAULT_CONFIG);
    expect(Object.keys(maker)).toEqual([]);
    expect(JSON.stringify(maker)).toBe('{}');
  });
});
