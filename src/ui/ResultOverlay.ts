import type { GameStatus } from '../core';
import { el, formatDuration } from './dom';

export interface ResultInfo {
  outcome: Exclude<GameStatus, 'playing'>;
  guessCount: number;
  elapsedMs: number;
  answer: string;
}

export interface ResultOverlayOptions {
  /** 以相同難度再玩一局。 */
  onRestart: () => void;
  /** 看這一局的復盤。 */
  onReview: () => void;
  /** 回到模式選擇畫面。 */
  onMenu: () => void;
}

export interface ResultOverlayHandle {
  readonly el: HTMLElement;
  show(info: ResultInfo): void;
  hide(): void;
}

/** 結算覆蓋層：顯示花了幾次、用時多久、答案，以及「再玩一次」與「回到選單」。 */
export function createResultOverlay(options: ResultOverlayOptions): ResultOverlayHandle {
  const titleEl = el('div', { class: 'result-title' });
  const answerLabel = el('div', { class: 'result-answer-label' });
  const answerEl = el('div', { class: 'result-answer' });
  const guessCountEl = el('strong', { class: 'result-stat-value' });
  const elapsedEl = el('strong', { class: 'result-stat-value' });
  const restartButton = el('button', { class: 'btn-primary btn-block', type: 'button', text: '再玩一次' });
  const reviewButton = el('button', {
    class: 'btn-outline btn-block result-review',
    type: 'button',
    text: '看復盤',
  });
  const menuButton = el('button', {
    class: 'btn-ghost btn-block result-menu',
    type: 'button',
    text: '回到選單',
  });

  restartButton.addEventListener('click', () => options.onRestart());
  reviewButton.addEventListener('click', () => options.onReview());
  menuButton.addEventListener('click', () => options.onMenu());

  const card = el('div', { class: 'overlay-card' }, [
    titleEl,
    answerLabel,
    answerEl,
    el('div', { class: 'result-stats' }, [
      el('div', { class: 'result-stat' }, [el('span', { text: '猜了' }), guessCountEl]),
      el('div', { class: 'result-stat' }, [el('span', { text: '用時' }), elapsedEl]),
    ]),
    restartButton,
    reviewButton,
    menuButton,
  ]);

  const overlay = el('div', { class: 'overlay', hidden: true }, [card]);

  return {
    el: overlay,
    show(info): void {
      const won = info.outcome === 'won';
      titleEl.textContent = won ? '猜中了！' : '本局放棄';
      titleEl.className = won ? 'result-title is-win' : 'result-title is-give-up';
      answerLabel.textContent = won ? '答案' : '答案是';
      answerEl.textContent = info.answer;
      answerEl.className = won ? 'result-answer is-win' : 'result-answer is-give-up';
      guessCountEl.textContent = `${info.guessCount} 次`;
      elapsedEl.textContent = formatDuration(info.elapsedMs);
      // 一次都沒猜就沒有東西可以復盤
      reviewButton.hidden = info.guessCount === 0;

      overlay.hidden = false;
      restartButton.focus();
    },
    hide(): void {
      overlay.hidden = true;
    },
  };
}
