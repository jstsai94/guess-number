import { el } from './dom';
import type { Difficulty } from './difficulty';
import { DIFFICULTIES, DIFFICULTY_DESCRIPTION, DIFFICULTY_LABEL } from './difficulty';

export interface MenuViewOptions {
  /** 點選難度卡片時觸發，由外層開新局。 */
  onStart: (difficulty: Difficulty) => void;
  /** 有提供時才顯示「連線對戰」區塊。 */
  versus?: {
    onCreateRoom: () => void;
    onJoinRoom: () => void;
  };
}

export interface MenuViewHandle {
  readonly el: HTMLElement;
  destroy(): void;
}

function modeCard(label: string, description: string, className: string, onClick: () => void): HTMLButtonElement {
  const card = el('button', { class: `mode-card ${className}`, type: 'button' }, [
    el('span', { class: 'mode-card-label', text: label }),
    el('span', { class: 'mode-card-desc', text: description }),
  ]);
  card.addEventListener('click', onClick);
  return card;
}

/** 模式選擇畫面：猜電腦（一般／惡魔），以及連線對戰（建立房間／加入房間）。 */
export function createMenuView(options: MenuViewOptions): MenuViewHandle {
  const difficultyCards = DIFFICULTIES.map((difficulty) =>
    modeCard(DIFFICULTY_LABEL[difficulty], DIFFICULTY_DESCRIPTION[difficulty], `is-${difficulty}`, () =>
      options.onStart(difficulty),
    ),
  );

  const sections: HTMLElement[] = [
    el('section', { class: 'menu-section' }, [
      el('h2', { class: 'menu-section-title', text: '猜電腦' }),
      el('div', { class: 'mode-grid' }, difficultyCards),
    ]),
  ];

  if (options.versus) {
    const { onCreateRoom, onJoinRoom } = options.versus;
    sections.push(
      el('section', { class: 'menu-section' }, [
        el('h2', { class: 'menu-section-title', text: '連線對戰' }),
        el('div', { class: 'mode-grid' }, [
          modeCard('建立房間', '開一個房間，把房號告訴朋友', 'is-host', onCreateRoom),
          modeCard('加入房間', '輸入朋友給你的房號', 'is-join', onJoinRoom),
        ]),
      ]),
    );
  }

  const root = el('div', { class: 'app menu' }, [
    el('header', { class: 'menu-header' }, [el('h1', { class: 'title', text: '1A2B 猜數字' })]),
    ...sections,
  ]);

  // 讓鍵盤使用者一進來就能直接用 Tab / Enter 選擇
  queueMicrotask(() => difficultyCards[0]?.focus());

  return {
    el: root,
    destroy(): void {
      root.remove();
    },
  };
}
