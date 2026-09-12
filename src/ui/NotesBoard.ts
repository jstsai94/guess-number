import type { DigitMark, GameNotes } from '../core';
import { NOTE_DIGITS } from '../core';
import { el } from './dom';

export interface NotesBoardHandle {
  readonly el: HTMLElement;
  /** 依 notes 目前的狀態重繪。 */
  refresh(): void;
  setEnabled(enabled: boolean): void;
}

const MARK_CLASS: Record<DigitMark, string> = {
  unknown: 'digit-mark is-unknown',
  excluded: 'digit-mark is-excluded',
  required: 'digit-mark is-required',
};

const MARK_LABEL: Record<DigitMark, string> = {
  unknown: '未定',
  excluded: '排除',
  required: '必有',
};

/**
 * 筆記板：0–9 數字狀態列 + 圖例 + 自由備註。
 *
 * 狀態直接讀寫傳入的 GameNotes（屬於這一局），這個元件自己不存狀態。
 */
export function createNotesBoard(notes: GameNotes): NotesBoardHandle {
  const buttons = new Map<string, HTMLButtonElement>();

  for (const digit of NOTE_DIGITS) {
    const button = el('button', { class: MARK_CLASS.unknown, type: 'button', text: digit });
    button.addEventListener('click', () => {
      notes.cycleMark(digit);
      paint(digit);
    });
    buttons.set(digit, button);
  }

  const grid = el('div', { class: 'digit-grid' }, [...buttons.values()]);

  const legend = el('div', { class: 'legend' }, [
    el('span', { class: 'legend-item' }, [
      el('i', { class: 'legend-swatch is-unknown' }),
      '未定',
    ]),
    el('span', { class: 'legend-item' }, [
      el('i', { class: 'legend-swatch is-excluded' }),
      '排除',
    ]),
    el('span', { class: 'legend-item' }, [
      el('i', { class: 'legend-swatch is-required' }),
      '必有',
    ]),
  ]);

  const memo = el('textarea', { class: 'memo', placeholder: '解題筆記…' });
  memo.addEventListener('input', () => {
    notes.memo = memo.value;
  });

  const root = el('div', { class: 'notes-board' }, [grid, legend, memo]);

  function paint(digit: string): void {
    const button = buttons.get(digit);
    if (!button) return;
    const mark = notes.getMark(digit);
    button.className = MARK_CLASS[mark];
    button.setAttribute('aria-label', `數字 ${digit}：${MARK_LABEL[mark]}`);
  }

  function refresh(): void {
    for (const digit of NOTE_DIGITS) paint(digit);
    memo.value = notes.memo;
  }

  refresh();

  return {
    el: root,
    refresh,
    setEnabled(enabled: boolean): void {
      for (const button of buttons.values()) button.disabled = !enabled;
      memo.disabled = !enabled;
    },
  };
}
