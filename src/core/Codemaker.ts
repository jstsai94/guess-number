import type { Code, Feedback, GameConfig } from './types';

/**
 * 出題者介面 —— 整個專案最重要的抽換點。
 *
 * UI 層永遠只透過 GameSession 與出題邏輯互動，絕對不可以繞過它取得答案。
 * 一般模式、惡魔模式、連線對戰各自提供實作，GameSession 與 UI 都不必修改。
 *
 * 三個方法都是非同步的：本地實作會立刻完成，
 * 連線對戰則要等對手的裝置或伺服器回應。
 *
 * 刻意只暴露三個方法，不要擴充。
 */
export interface Codemaker {
  /** 開始新的一局，內部產生（或準備）答案。 */
  startGame(config: GameConfig): Promise<void>;

  /** 判定一次猜測，回傳 xAyB。 */
  judge(guess: Code): Promise<Feedback>;

  /** 揭曉答案。僅供獲勝或放棄後使用。 */
  reveal(): Promise<Code>;
}
