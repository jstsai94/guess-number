import { GameSession } from '../core';
import { createGameView } from './GameView';
import type { GameViewHandle } from './GameView';
import { createMenuView } from './MenuView';
import type { MenuViewHandle } from './MenuView';
import { createCodemaker } from './difficulty';
import type { Difficulty } from './difficulty';

/**
 * 掛載應用：在「模式選擇」與「遊戲」兩個畫面之間切換。
 *
 * 「目前顯示哪個畫面」是 mountApp 的區域變數，不是模組層級的全域狀態 ——
 * 要在同一頁掛兩份，直接呼叫兩次即可。
 */
export function mountApp(root: HTMLElement): void {
  let current: GameViewHandle | MenuViewHandle | null = null;

  const show = (next: GameViewHandle | MenuViewHandle): void => {
    current?.destroy();
    current = next;
    root.replaceChildren(next.el);
    window.scrollTo(0, 0);
  };

  const showMenu = (): void => {
    show(createMenuView({ onStart: (difficulty) => void startGame(difficulty) }));
  };

  const startGame = async (difficulty: Difficulty): Promise<void> => {
    // 開局是非同步的：本地模式立刻完成，連線對戰要等房間準備好
    const session = await GameSession.create(createCodemaker(difficulty));
    show(
      createGameView(session, {
        difficulty,
        onRestart: () => void startGame(difficulty),
        onMenu: showMenu,
      }),
    );
  };

  showMenu();
}
