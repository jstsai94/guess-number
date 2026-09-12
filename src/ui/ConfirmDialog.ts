import { el } from './dom';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
}

export interface ConfirmDialogHandle {
  readonly el: HTMLElement;
  /** 顯示對話框，回傳使用者是否按下確認。 */
  ask(options: ConfirmOptions): Promise<boolean>;
  close(): void;
}

/**
 * 頁面內的二次確認對話框。
 *
 * 不使用 window.confirm：原生對話框在內嵌環境會被擋掉，而且沒辦法照規格調樣式。
 */
export function createConfirmDialog(): ConfirmDialogHandle {
  const titleEl = el('div', { class: 'confirm-title' });
  const messageEl = el('p', { class: 'confirm-message' });
  const cancelButton = el('button', { class: 'btn-ghost', type: 'button' });
  const confirmButton = el('button', { class: 'btn-primary', type: 'button' });

  const card = el('div', { class: 'overlay-card confirm-card' }, [
    titleEl,
    messageEl,
    el('div', { class: 'confirm-actions' }, [cancelButton, confirmButton]),
  ]);

  const overlay = el('div', { class: 'overlay', hidden: true }, [card]);

  let settle: ((value: boolean) => void) | null = null;

  const finish = (value: boolean): void => {
    overlay.hidden = true;
    const resolve = settle;
    settle = null;
    resolve?.(value);
  };

  cancelButton.addEventListener('click', () => finish(false));
  confirmButton.addEventListener('click', () => finish(true));
  overlay.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') finish(false);
  });

  return {
    el: overlay,
    ask(options): Promise<boolean> {
      // 前一個問題還沒答完就被新的取代時，視同取消
      finish(false);

      titleEl.textContent = options.title;
      messageEl.textContent = options.message ?? '';
      messageEl.hidden = !options.message;
      cancelButton.textContent = options.cancelText ?? '取消';
      confirmButton.textContent = options.confirmText ?? '確認';

      overlay.hidden = false;
      confirmButton.focus();

      return new Promise<boolean>((resolve) => {
        settle = resolve;
      });
    },
    close(): void {
      finish(false);
    },
  };
}
