import { el } from './dom';

export interface GuessInputOptions {
  /** 數字格數量（猜數字是 4 格，房號是 6 格）。 */
  length: number;
  /** 按下送出（或 Enter）時觸發，帶入目前已填入的字串。 */
  onSubmit: (code: string) => void;
  /** 送出按鈕上的文字，預設「送出」。 */
  submitLabel?: string;
}

export interface GuessInputHandle {
  readonly el: HTMLElement;
  /** 目前輸入的內容，未填滿時長度會小於 length。 */
  value(): string;
  clear(): void;
  /** 把編輯位置移回第一格。 */
  focusFirst(): void;
  /** 把焦點放回目前正在編輯的格子，不改變編輯位置。 */
  focusActive(): void;
  setEnabled(enabled: boolean): void;
  /** 由外層把實體鍵盤事件轉進來；有處理到就回傳 true。 */
  handleKey(event: KeyboardEvent): boolean;
}

/**
 * 數字格 + 送出按鈕 + 頁面內建數字鍵盤。
 *
 * 數字格刻意**不是** <input>：在手機與平板上點 <input> 會叫出系統鍵盤，
 * 擋住半個畫面，iOS 還會順便把頁面放大。改用按鈕之後，
 * 觸控裝置一律走頁面內建鍵盤，桌機則照舊用實體鍵盤直接打。
 *
 * 鍵盤行為不變：打字自動跳下一格、Backspace 退回上一格、Enter 送出。
 * 這個元件不做合法性判斷，只負責收集輸入。
 */
export function createGuessInput(options: GuessInputOptions): GuessInputHandle {
  const { length, onSubmit, submitLabel = '送出' } = options;

  const digits = Array.from({ length }, () => '');
  let active = 0;

  // ---------- 數字格 ----------

  const slots: HTMLButtonElement[] = [];
  for (let i = 0; i < length; i += 1) {
    const slot = el('button', {
      class: 'slot',
      type: 'button',
      'aria-label': `第 ${i + 1} 個數字`,
    });
    slot.addEventListener('click', () => setActive(i));
    slots.push(slot);
  }

  const submitButton = el('button', { class: 'submit', type: 'button', text: submitLabel });
  submitButton.addEventListener('click', submit);

  const row = el('div', { class: 'input-row' }, [...slots, submitButton]);

  // ---------- 頁面內建數字鍵盤 ----------

  const keypadKeys: HTMLButtonElement[] = [];

  const numberKey = (digit: string): HTMLButtonElement => {
    const key = el('button', { class: 'key', type: 'button', text: digit });
    key.addEventListener('click', () => typeDigit(digit));
    keypadKeys.push(key);
    return key;
  };

  const backspaceKey = el('button', {
    class: 'key key-text',
    type: 'button',
    text: '刪除',
  });
  backspaceKey.addEventListener('click', backspace);
  keypadKeys.push(backspaceKey);

  const keypadSubmit = el('button', {
    class: 'key key-submit',
    type: 'button',
    text: submitLabel,
  });
  keypadSubmit.addEventListener('click', submit);
  keypadKeys.push(keypadSubmit);

  const keypad = el('div', { class: 'keypad' }, [
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(numberKey),
    backspaceKey,
    numberKey('0'),
    keypadSubmit,
  ]);

  const root = el('div', { class: 'input-area' }, [row, keypad]);

  // ---------- 行為 ----------

  function value(): string {
    return digits.join('');
  }

  function paint(): void {
    slots.forEach((slot, i) => {
      slot.textContent = digits[i] ?? '';
      slot.classList.toggle('is-active', i === active);
      slot.classList.toggle('is-filled', digits[i] !== '');
    });
  }

  function setActive(index: number): void {
    active = Math.min(Math.max(index, 0), length - 1);
    paint();
    slots[active]?.focus();
  }

  function typeDigit(digit: string): void {
    digits[active] = digit;
    if (active < length - 1) setActive(active + 1);
    else paint();
  }

  function backspace(): void {
    if (digits[active] !== '') {
      // 本格有字就先清本格
      digits[active] = '';
      paint();
      return;
    }
    if (active > 0) {
      // 本格已空，退回上一格並清掉它
      digits[active - 1] = '';
      setActive(active - 1);
    }
  }

  function submit(): void {
    onSubmit(value());
  }

  paint();

  return {
    el: root,
    value,

    clear(): void {
      digits.fill('');
      active = 0;
      paint();
    },

    focusFirst(): void {
      setActive(0);
    },

    focusActive(): void {
      slots[active]?.focus();
    },

    setEnabled(enabled: boolean): void {
      for (const slot of slots) slot.disabled = !enabled;
      for (const key of keypadKeys) key.disabled = !enabled;
      submitButton.disabled = !enabled;
    },

    handleKey(event: KeyboardEvent): boolean {
      if (event.altKey || event.ctrlKey || event.metaKey) return false;

      if (event.key >= '0' && event.key <= '9' && event.key.length === 1) {
        event.preventDefault();
        typeDigit(event.key);
        return true;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        backspace();
        return true;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
        return true;
      }
      return false;
    },
  };
}
