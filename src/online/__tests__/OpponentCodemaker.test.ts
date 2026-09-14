import { describe, it, expect } from 'vitest';
import { GameSession, judge } from '../../core';
import type { Feedback } from '../../core';
import { OpponentCodemaker } from '../OpponentCodemaker';
import type { OpponentLink } from '../OpponentCodemaker';

/** 模擬對手：密碼固定，判定立刻完成；開始時機與送出失敗可由測試控制。 */
function fakeOpponent(secret = '4721') {
  let releaseStart!: () => void;
  const started = new Promise<void>((resolve) => {
    releaseStart = resolve;
  });
  const sent: string[] = [];
  let failNextSend = false;

  const link: OpponentLink = {
    waitForStart: () => started,
    sendGuess: async (guess) => {
      if (failNextSend) {
        failNextSend = false;
        throw new Error('網路中斷');
      }
      sent.push(guess);
      return `me_${guess}`;
    },
    waitForFeedback: async (guessId): Promise<Feedback> => judge(secret, guessId.slice('me_'.length)),
    waitForReveal: async () => secret,
  };

  return {
    link,
    sent,
    start: () => releaseStart(),
    failNextSend: () => {
      failNextSend = true;
    },
  };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('OpponentCodemaker', () => {
  it('雙方都設定好密碼之前，開局不會完成', async () => {
    const opponent = fakeOpponent();
    let ready = false;
    const creating = GameSession.create(new OpponentCodemaker(opponent.link)).then((game) => {
      ready = true;
      return game;
    });

    await flush();
    expect(ready).toBe(false);

    opponent.start();
    await creating;
    expect(ready).toBe(true);
  });

  it('judge 會把猜測送出，並回傳對手裝置判定的結果', async () => {
    const opponent = fakeOpponent('4721');
    opponent.start();
    const maker = new OpponentCodemaker(opponent.link);
    await maker.startGame({ codeLength: 4, allowDuplicateDigits: false });

    expect(await maker.judge('4712')).toEqual({ A: 2, B: 2 });
    expect(opponent.sent).toEqual(['4712']);
  });

  it('reveal 回傳對手公開的密碼', async () => {
    const opponent = fakeOpponent('0856');
    const maker = new OpponentCodemaker(opponent.link);
    expect(await maker.reveal()).toBe('0856');
  });

  it('搭配 GameSession 可以一路猜到中，揭曉的就是對手的密碼', async () => {
    const opponent = fakeOpponent('4721');
    opponent.start();
    const game = await GameSession.create(new OpponentCodemaker(opponent.link));

    for (const guess of ['0123', '5678', '4712', '4721']) {
      expect((await game.submitGuess(guess)).ok).toBe(true);
    }

    expect(game.status).toBe('won');
    expect(game.guessCount).toBe(4);
    expect(await game.getAnswer()).toBe('4721');
  });

  it('送出失敗時不計次，可以重送同一組', async () => {
    const opponent = fakeOpponent('4721');
    opponent.start();
    const game = await GameSession.create(new OpponentCodemaker(opponent.link));

    opponent.failNextSend();
    await expect(game.submitGuess('0123')).rejects.toThrow('網路中斷');
    expect(game.guessCount).toBe(0);
    expect(game.hasGuessed('0123')).toBe(false);

    expect((await game.submitGuess('0123')).ok).toBe(true);
    expect(game.guessCount).toBe(1);
  });
});
