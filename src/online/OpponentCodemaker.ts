import type { Code, Codemaker, Feedback, GameConfig } from '../core';

/**
 * OpponentCodemaker 需要的連線能力。
 *
 * 刻意抽成介面：Firestore 的細節留在 room.ts，
 * 這個 Codemaker 本身不必連線就能完整做單元測試。
 */
export interface OpponentLink {
  /** 等待雙方都設定好密碼、對戰正式開始。 */
  waitForStart(): Promise<void>;
  /** 把一次猜測送到資料庫，回傳這筆猜測的 ID。 */
  sendGuess(guess: Code): Promise<string>;
  /** 等待對手的裝置判定這筆猜測。 */
  waitForFeedback(guessId: string): Promise<Feedback>;
  /** 等待對手公開密碼。 */
  waitForReveal(): Promise<Code>;
}

/**
 * 「互相出題」模式的出題者：答案是對手設定的密碼。
 *
 * 這一端從頭到尾都不知道答案 ——
 * 判定由對手的裝置完成，答案要等對手在結束時公開才拿得到。
 */
export class OpponentCodemaker implements Codemaker {
  readonly #link: OpponentLink;

  constructor(link: OpponentLink) {
    this.#link = link;
  }

  async startGame(_config: GameConfig): Promise<void> {
    await this.#link.waitForStart();
  }

  async judge(guess: Code): Promise<Feedback> {
    const guessId = await this.#link.sendGuess(guess);
    return this.#link.waitForFeedback(guessId);
  }

  async reveal(): Promise<Code> {
    return this.#link.waitForReveal();
  }
}
