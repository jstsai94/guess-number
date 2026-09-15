import { el } from './dom';
import type { Difficulty } from './difficulty';
import { DIFFICULTIES, DIFFICULTY_LABEL } from './difficulty';

export interface MenuViewOptions {
  /** 點選難度卡片時觸發，由外層開新局。 */
  onStart: (difficulty: Difficulty) => void;
  /** 點選「電腦解題」卡片。 */
  onSolve: () => void;
  /** 有提供時才顯示「連線模式」區塊。 */
  versus?: {
    onCreateRoom: () => void;
    onJoinRoom: () => void;
  };
}

export interface MenuViewHandle {
  readonly el: HTMLElement;
  destroy(): void;
}

/** description 為 null 時卡片只顯示名稱（一般、惡魔）。 */
function modeCard(label: string, description: string | null, className: string, onClick: () => void): HTMLButtonElement {
  const card = el('button', { class: `mode-card ${className}`, type: 'button' }, [
    el('span', { class: 'mode-card-label', text: label }),
    ...(description ? [el('span', { class: 'mode-card-desc', text: description })] : []),
  ]);
  card.addEventListener('click', onClick);
  return card;
}

/** 模式選擇畫面：單機模式（一般／惡魔／電腦解題），以及連線模式（建立房間／加入房間）。 */
export function createMenuView(options: MenuViewOptions): MenuViewHandle {
  const difficultyCards = DIFFICULTIES.map((difficulty) =>
    modeCard(DIFFICULTY_LABEL[difficulty], null, `is-${difficulty}`, () =>
      options.onStart(difficulty),
    ),
  );

  const sections: HTMLElement[] = [
    el('section', { class: 'menu-section' }, [
      el('h2', { class: 'menu-section-title', text: '單機模式' }),
      el('div', { class: 'mode-grid is-three' }, [
        ...difficultyCards,
        modeCard('電腦解題', '你出一組密碼給電腦猜，看它每一步怎麼推理。', 'is-solver', options.onSolve),
      ]),
    ]),
  ];

  if (options.versus) {
    const { onCreateRoom, onJoinRoom } = options.versus;
    sections.push(
      el('section', { class: 'menu-section' }, [
        el('h2', { class: 'menu-section-title', text: '連線模式' }),
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
