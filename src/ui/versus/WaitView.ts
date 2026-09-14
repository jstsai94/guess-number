import { el } from '../dom';

export interface WaitViewOptions {
  readonly roomCode: string;
  readonly onCancel: () => void;
}

export interface WaitViewHandle {
  readonly el: HTMLElement;
  destroy(): void;
}

/** 房主等待對手加入：大字顯示房號、複製房號、取消。 */
export function createWaitView(options: WaitViewOptions): WaitViewHandle {
  const copyButton = el('button', { class: 'btn-outline', type: 'button', text: '複製房號' });
  const cancelButton = el('button', { class: 'btn-ghost', type: 'button', text: '取消' });

  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  copyButton.addEventListener('click', () => {
    const flash = (text: string): void => {
      copyButton.textContent = text;
      if (resetTimer !== null) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        copyButton.textContent = '複製房號';
      }, 2000);
    };

    if (!navigator.clipboard) {
      flash('無法複製，請手動記下房號');
      return;
    }
    navigator.clipboard.writeText(options.roomCode).then(
      () => flash('已複製'),
      () => flash('無法複製，請手動記下房號'),
    );
  });

  cancelButton.addEventListener('click', () => options.onCancel());

  const root = el('section', { class: 'panel versus-card' }, [
    el('div', { class: 'versus-label', text: '房號' }),
    el('div', { class: 'room-code', text: options.roomCode, 'aria-label': `房號 ${[...options.roomCode].join(' ')}` }),
    el('div', { class: 'versus-actions' }, [copyButton]),
    el('p', { class: 'versus-hint', text: '把房號告訴朋友，等待對方加入…' }),
    el('div', { class: 'versus-actions' }, [cancelButton]),
  ]);

  return {
    el: root,
    destroy(): void {
      if (resetTimer !== null) clearTimeout(resetTimer);
      root.remove();
    },
  };
}
