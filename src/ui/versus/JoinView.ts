import { el } from '../dom';
import { createGuessInput } from '../GuessInput';

export interface JoinViewOptions {
  readonly onJoin: (roomCode: string) => void;
  readonly onBack: () => void;
}

export interface JoinViewHandle {
  readonly el: HTMLElement;
  showError(message: string): void;
  setBusy(busy: boolean): void;
  destroy(): void;
}

const ROOM_CODE_LENGTH = 6;
const HINT = '輸入朋友給你的 6 位數字房號';

/**
 * 加入房間：6 個數字格 + 內建數字鍵盤，操作方式與猜數字的輸入區相同，
 * 所以手機上一樣不會叫出系統鍵盤。
 */
export function createJoinView(options: JoinViewOptions): JoinViewHandle {
  const hint = el('p', { class: 'hint', text: HINT });

  const input = createGuessInput({
    length: ROOM_CODE_LENGTH,
    submitLabel: '加入',
    onSubmit: (code) => {
      if (!/^\d{6}$/.test(code)) {
        showError('請輸入 6 位數字的房號');
        return;
      }
      options.onJoin(code);
    },
  });

  const backButton = el('button', { class: 'btn-ghost', type: 'button', text: '返回' });
  backButton.addEventListener('click', () => options.onBack());

  // 沿用猜數字輸入區的版面：觸控裝置上提示會排在數字格與鍵盤之間
  const panel = el('section', { class: 'panel panel-left versus-join' }, [
    el('h2', { class: 'versus-title', text: '加入房間' }),
    input.el,
    hint,
  ]);

  const root = el('div', { class: 'versus-stack' }, [panel, el('div', { class: 'versus-actions' }, [backButton])]);

  // 實體鍵盤監聽掛在這個畫面的容器上，不是 document 上
  root.addEventListener('keydown', (event: KeyboardEvent) => {
    const target = event.target;
    if (target instanceof HTMLButtonElement && !target.classList.contains('slot')) {
      if (event.key === 'Enter' || event.key === ' ') return;
    }
    input.handleKey(event);
  });

  queueMicrotask(() => input.focusFirst());

  function showError(message: string): void {
    hint.textContent = message;
    hint.className = 'hint is-error';
  }

  return {
    el: root,
    showError,
    setBusy(busy: boolean): void {
      input.setEnabled(!busy);
      backButton.disabled = busy;
      if (busy) {
        hint.textContent = '加入中…';
        hint.className = 'hint';
      } else {
        input.focusActive();
      }
    },
    destroy(): void {
      root.remove();
    },
  };
}
