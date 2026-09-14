import { el } from './dom';
import type { Difficulty } from './difficulty';
import { DIFFICULTIES, DIFFICULTY_DESCRIPTION, DIFFICULTY_LABEL } from './difficulty';

export interface MenuViewOptions {
  /** 點選難度卡片時觸發，由外層開新局。 */
  onStart: (difficulty: Difficulty) => void;
}

export interface MenuViewHandle {
  readonly el: HTMLElement;
  destroy(): void;
}

/**
 * 模式選擇畫面。
 *
 * 第二期 D 完成前只有「猜電腦」區塊；連線對戰會以另一個區塊加在這裡。
 */
export function createMenuView(options: MenuViewOptions): MenuViewHandle {
  const cards = DIFFICULTIES.map((difficulty) => {
    const card = el('button', { class: `mode-card is-${difficulty}`, type: 'button' }, [
      el('span', { class: 'mode-card-label', text: DIFFICULTY_LABEL[difficulty] }),
      el('span', { class: 'mode-card-desc', text: DIFFICULTY_DESCRIPTION[difficulty] }),
    ]);
    card.addEventListener('click', () => options.onStart(difficulty));
    return card;
  });

  const root = el('div', { class: 'app menu' }, [
    el('header', { class: 'menu-header' }, [el('h1', { class: 'title', text: '1A2B 猜數字' })]),
    el('section', { class: 'menu-section' }, [
      el('h2', { class: 'menu-section-title', text: '猜電腦' }),
      el('div', { class: 'mode-grid' }, cards),
    ]),
  ]);

  // 讓鍵盤使用者一進來就能直接用 Tab / Enter 選擇
  queueMicrotask(() => cards[0]?.focus());

  return {
    el: root,
    destroy(): void {
      root.remove();
    },
  };
}
