import { GameSession, LocalRandomCodemaker } from '../core';
import { createGameView } from './GameView';
import type { GameViewHandle } from './GameView';

/**
 * 掛載應用。
 *
 * 目前這一版畫面上只有一局，但「目前是哪一局」是 mountApp 的區域變數，
 * 不是模組層級的全域狀態 —— 未來要在同一頁掛兩局，直接呼叫兩次即可。
 */
export function mountApp(root: HTMLElement): void {
  let view: GameViewHandle | null = null;

  const startNewGame = (): void => {
    view?.destroy();
    const session = new GameSession(new LocalRandomCodemaker());
    view = createGameView(session, { onRestart: startNewGame });
    root.replaceChildren(view.el);
  };

  startNewGame();
}
