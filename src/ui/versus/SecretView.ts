import { validateCode } from '../../core';
import { el } from '../dom';
import { createGuessInput } from '../GuessInput';

export interface SecretViewOptions {
  /** 確定密碼時觸發；失敗時丟出例外，畫面會提示再試一次。 */
  readonly onCommit: (code: string) => Promise<void>;
}

export interface SecretViewState {
  readonly meCommitted: boolean;
  readonly opponentCommitted: boolean;
}

export interface SecretViewHandle {
  readonly el: HTMLElement;
  update(state: SecretViewState): void;
  destroy(): void;
}

const HINT = '輸入 4 個不重複的數字';

/**
 * 設定密碼（雙方）：規則與猜測相同，按「確定」後不能修改。
 * 密碼只留在本機，資料庫只收到雜湊（由 match.commit 處理）。
 */
export function createSecretView(options: SecretViewOptions): SecretViewHandle {
  const hint = el('p', { class: 'hint', text: HINT });
  const opponentStatus = el('p', { class: 'opponent-status', text: '對手：設定中…' });

  let committing = false;
  let committedCode: string | null = null;

  const input = createGuessInput({
    length: 4,
    submitLabel: '確定',
    onSubmit: (code) => void submit(code),
  });

  const title = el('h2', { class: 'versus-title', text: '設定你的密碼' });
  const subtitle = el('p', { class: 'versus-subtitle', text: '對手要猜的就是這一組' });

  const panel = el('section', { class: 'panel panel-left versus-secret' }, [
    title,
    subtitle,
    input.el,
    hint,
    opponentStatus,
  ]);

  // 實體鍵盤監聽掛在這個畫面的容器上，不是 document 上
  panel.addEventListener('keydown', (event: KeyboardEvent) => {
    if (committing || committedCode !== null) return;
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

  async function submit(code: string): Promise<void> {
    if (committing || committedCode !== null) return;

    const issue = validateCode(code);
    if (issue === 'length') {
      showError('請輸入 4 個數字');
      return;
    }
    if (issue !== null) {
      showError('4 個數字不能重複');
      input.clear();
      input.focusFirst();
      return;
    }

    committing = true;
    input.setEnabled(false);
    hint.textContent = '設定中…';
    hint.className = 'hint';

    try {
      await options.onCommit(code);
      committedCode = code;
      showCommitted();
    } catch {
      committing = false;
      input.setEnabled(true);
      input.focusActive();
      showError('無法設定密碼，請再試一次');
    }
  }

  /** 設定完成：收起輸入區，只顯示自己的密碼與等待訊息。 */
  function showCommitted(): void {
    const children: HTMLElement[] = [el('h2', { class: 'versus-title', text: '你的密碼' })];
    if (committedCode !== null) {
      children.push(
        el('div', {
          class: 'my-secret',
          text: committedCode,
          'aria-label': `你的密碼 ${[...committedCode].join(' ')}`,
        }),
      );
    } else {
      // 重新整理後回來：這個畫面不知道剛才輸入了什麼，只說明已設定
      children.push(el('p', { class: 'versus-subtitle', text: '已經設定完成，不能再修改' }));
    }
    children.push(el('p', { class: 'versus-subtitle', text: '雙方都設定好就會直接開始' }), opponentStatus);
    panel.replaceChildren(...children);
  }

  return {
    el: panel,

    update(state): void {
      opponentStatus.textContent = state.opponentCommitted ? '對手：已設定 ✓' : '對手：設定中…';
      opponentStatus.classList.toggle('is-ready', state.opponentCommitted);

      if (state.meCommitted && committedCode === null && !committing) {
        showCommitted();
      }
    },

    destroy(): void {
      panel.remove();
    },
  };
}
