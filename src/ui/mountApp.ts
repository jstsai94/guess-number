import { GameSession } from '../core';
import { createGameView } from './GameView';
import { createMenuView } from './MenuView';
import { createCodemaker } from './difficulty';
import type { Difficulty } from './difficulty';

interface ScreenHandle {
  readonly el: HTMLElement;
  destroy(): void;
}

/**
 * 掛載應用：在「模式選擇」「猜電腦」「連線對戰」幾個畫面之間切換。
 *
 * 「目前顯示哪個畫面」是 mountApp 的區域變數，不是模組層級的全域狀態 ——
 * 要在同一頁掛兩份，直接呼叫兩次即可。
 */
export function mountApp(root: HTMLElement): void {
  let current: ScreenHandle | null = null;

  const show = (next: ScreenHandle): void => {
    current?.destroy();
    current = next;
    root.replaceChildren(next.el);
    window.scrollTo(0, 0);
  };

  const showMenu = (): void => {
    show(
      createMenuView({
        onStart: (difficulty) => void startGame(difficulty),
        versus: {
          onCreateRoom: () => void startVersus('host'),
          onJoinRoom: () => void startVersus('join'),
        },
      }),
    );
  };

  const startGame = async (difficulty: Difficulty): Promise<void> => {
    // 開局是非同步的：本地模式立刻完成
    const session = await GameSession.create(createCodemaker(difficulty));
    show(
      createGameView(session, {
        difficulty,
        onRestart: () => void startGame(difficulty),
        onMenu: showMenu,
      }),
    );
  };

  const startVersus = async (mode: 'host' | 'join'): Promise<void> => {
    // 按需載入：只有真的進入連線對戰，才會下載 Firebase
    try {
      const { createVersusScreen } = await import('./versus');
      show(createVersusScreen({ mode, onExit: showMenu }));
    } catch (error) {
      console.error('無法載入連線對戰模組', error);
    }
  };

  showMenu();
}
