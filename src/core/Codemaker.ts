import type { Code, Feedback, GameConfig } from './types';

/**
 * 出題者介面 —— 整個專案最重要的抽換點。
 *
 * UI 層永遠只透過這個介面與出題邏輯互動，絕對不可以繞過它取得答案。
 * 未來新增「惡魔模式」（動態改答案）或「雙人對戰」（由對手出題），
 * 只需要提供新的 Codemaker 實作，UI 與 GameSession 都不必修改。
 *
 * 刻意只暴露三個方法，不要擴充。
 */
export interface Codemaker {
  /** 開始新的一局，內部產生（或準備）答案。 */
  startGame(config: GameConfig): void;

  /** 判定一次猜測，回傳 xAyB。 */
  judge(guess: Code): Feedback;

  /** 揭曉答案。僅供獲勝或放棄後使用。 */
  reveal(): Code;
}
