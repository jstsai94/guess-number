import { el } from './dom';

export interface PauseOverlayHandle {
  readonly el: HTMLElement;
  show(): void;
  hide(): void;
}

export interface PauseOverlayOptions {
  onResume: () => void;
  /** 「放棄這一局」：二次確認由外層負責。 */
  onSurrender: () => void;
}

/**
 * 暫停畫面：「繼續」與「放棄這一局」。
 *
 * 背景是不透明的，完全遮住底下的棋盤 ——
 * 如果還看得到歷史紀錄與筆記，暫停就等於免費的思考時間。
 */
export function createPauseOverlay(options: PauseOverlayOptions): PauseOverlayHandle {
  const resumeButton = el('button', { class: 'btn-primary btn-block', type: 'button', text: '繼續' });
  resumeButton.addEventListener('click', () => options.onResume());

  const surrenderButton = el('button', {
    class: 'btn-outline btn-block pause-surrender',
    type: 'button',
    text: '放棄這一局',
  });
  surrenderButton.addEventListener('click', () => options.onSurrender());

  const card = el('div', { class: 'overlay-card pause-card' }, [
    el('div', { class: 'pause-title', text: '已暫停' }),
    resumeButton,
    surrenderButton,
  ]);

  const overlay = el('div', { class: 'overlay overlay-pause', hidden: true }, [card]);

  return {
    el: overlay,
    show(): void {
      overlay.hidden = false;
      resumeButton.focus();
    },
    hide(): void {
      overlay.hidden = true;
    },
  };
}
