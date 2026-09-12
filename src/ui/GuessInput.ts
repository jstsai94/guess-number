import { el } from './dom';

export interface GuessInputOptions {
  /** 數字格數量。 */
  length: number;
  /** 按下送出（或 Enter）時觸發，帶入目前 4 格組成的字串。 */
  onSubmit: (code: string) => void;
}

export interface GuessInputHandle {
  readonly el: HTMLElement;
  /** 目前輸入的內容，未填滿時長度會小於 length。 */
  value(): string;
  clear(): void;
  focusFirst(): void;
  setEnabled(enabled: boolean): void;
}

/**
 * 4 個獨立數字格 + 送出按鈕。
 *
 * 鍵盤優先：打字自動跳下一格、Backspace 退回上一格、Enter 送出。
 * 這個元件不做合法性判斷，只負責收集輸入。
 */
export function createGuessInput(options: GuessInputOptions): GuessInputHandle {
  const { length, onSubmit } = options;

  const cells: HTMLInputElement[] = [];
  for (let i = 0; i < length; i += 1) {
    cells.push(
      el('input', {
        class: 'digit',
        type: 'text',
        inputmode: 'numeric',
        maxlength: 1,
        autocomplete: 'off',
        'aria-label': `第 ${i + 1} 個數字`,
      }),
    );
  }

  const submitButton = el('button', { class: 'submit', type: 'button', text: '送出' });
  const row = el('div', { class: 'input-row' }, [...cells, submitButton]);

  const value = (): string => cells.map((cell) => cell.value).join('');

  const focusCell = (index: number): void => {
    const target = cells[Math.min(Math.max(index, 0), length - 1)];
    target?.focus();
    target?.select();
  };

  const submit = (): void => {
    onSubmit(value());
  };

  cells.forEach((cell, index) => {
    cell.addEventListener('input', () => {
      // 只留下最後輸入的那個數字，非數字一律丟棄
      const digits = cell.value.replace(/\D/g, '');
      cell.value = digits.slice(-1);
      if (cell.value !== '' && index < length - 1) focusCell(index + 1);
    });

    cell.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
        return;
      }
      if (event.key === 'Backspace' && cell.value === '' && index > 0) {
        // 本格已空，退回上一格並清掉它
        event.preventDefault();
        const previous = cells[index - 1]!;
        previous.value = '';
        focusCell(index - 1);
      }
    });

    cell.addEventListener('focus', () => cell.select());
  });

  submitButton.addEventListener('click', submit);

  return {
    el: row,
    value,
    clear(): void {
      for (const cell of cells) cell.value = '';
    },
    focusFirst(): void {
      focusCell(0);
    },
    setEnabled(enabled: boolean): void {
      for (const cell of cells) cell.disabled = !enabled;
      submitButton.disabled = !enabled;
    },
  };
}
