import type { DigitMark, GameNotes, PositionMark } from '../core';
import { NOTE_DIGITS } from '../core';
import { el } from './dom';

export interface NotesBoardHandle {
  readonly el: HTMLElement;
  /** 「清除筆記」按鈕，由外層放進筆記板的標題列。 */
  readonly clearButton: HTMLButtonElement;
  /** 依 notes 目前的狀態重繪。 */
  refresh(): void;
  setEnabled(enabled: boolean): void;
}

const DIGIT_CLASS: Record<DigitMark, string> = {
  unknown: 'digit-mark is-unknown',
  excluded: 'digit-mark is-excluded',
  required: 'digit-mark is-required',
};

const DIGIT_LABEL: Record<DigitMark, string> = {
  unknown: '未定',
  excluded: '排除',
  required: '必有',
};

const POSITION_CLASS: Record<PositionMark, string> = {
  possible: 'pos-cell is-possible',
  impossible: 'pos-cell is-impossible',
  confirmed: 'pos-cell is-confirmed',
};

const POSITION_LABEL: Record<PositionMark, string> = {
  possible: '可能',
  impossible: '不可能',
  confirmed: '確定',
};

/**
 * 筆記板：
 *   1. 數字狀態列 —— 這個數字在不在答案裡
 *   2. 位置推理表 —— 以「第幾格」為一列，這一格可不可能是某個數字
 *
 * 狀態直接讀寫傳入的 GameNotes（屬於這一局），這個元件自己不存狀態。
 */
export function createNotesBoard(notes: GameNotes, codeLength: number): NotesBoardHandle {
  const digitButtons = new Map<string, HTMLButtonElement>();
  const positionButtons = new Map<string, HTMLButtonElement>();

  // ---------- 數字狀態列 ----------

  for (const digit of NOTE_DIGITS) {
    const button = el('button', { class: DIGIT_CLASS.unknown, type: 'button', text: digit });
    button.addEventListener('click', () => {
      notes.cycleMark(digit);
      paintDigit(digit);
      // 排除與否會連動位置推理表上這個數字的每一格
      paintPositionsOf(digit);
    });
    digitButtons.set(digit, button);
  }

  const digitGrid = el('div', { class: 'digit-grid' }, [...digitButtons.values()]);

  const digitLegend = el('div', { class: 'legend' }, [
    legendItem('legend-swatch is-unknown', '未定'),
    legendItem('legend-swatch is-excluded', '排除'),
    legendItem('legend-swatch is-required', '必有'),
  ]);

  // ---------- 位置推理表 ----------

  const positionRows: HTMLElement[] = [];

  for (let position = 0; position < codeLength; position += 1) {
    const cells: HTMLElement[] = [el('span', { class: 'pos-label', text: `第${position + 1}格` })];

    for (const digit of NOTE_DIGITS) {
      const cell = el('button', { class: POSITION_CLASS.possible, type: 'button', text: digit });
      cell.addEventListener('click', () => {
        notes.cyclePositionMark(digit, position);
        paintPosition(digit, position);
      });
      positionButtons.set(cellKey(digit, position), cell);
      cells.push(cell);
    }

    positionRows.push(el('div', { class: 'pos-row' }, cells));
  }

  const positionGrid = el('div', { class: 'pos-grid' }, positionRows);

  const positionLegend = el('div', { class: 'legend' }, [
    legendItem('legend-swatch is-possible', '可能'),
    legendItem('legend-swatch is-impossible', '不可能'),
    legendItem('legend-swatch is-confirmed', '確定'),
  ]);

  const root = el('div', { class: 'notes-board' }, [
    digitGrid,
    digitLegend,
    el('div', { class: 'notes-section-title', text: '位置推理' }),
    positionGrid,
    positionLegend,
  ]);

  // ---------- 繪製 ----------

  function paintDigit(digit: string): void {
    const button = digitButtons.get(digit);
    if (!button) return;
    const mark = notes.getMark(digit);
    button.className = DIGIT_CLASS[mark];
    button.setAttribute('aria-label', `數字 ${digit}：${DIGIT_LABEL[mark]}`);
  }

  function paintPosition(digit: string, position: number): void {
    const cell = positionButtons.get(cellKey(digit, position));
    if (!cell) return;
    const mark = notes.getPositionMark(digit, position);
    const locked = notes.isPositionLocked(digit);
    cell.className = locked ? `${POSITION_CLASS[mark]} is-locked` : POSITION_CLASS[mark];
    cell.setAttribute(
      'aria-label',
      `第 ${position + 1} 格是 ${digit}：${POSITION_LABEL[mark]}${locked ? '（數字已排除）' : ''}`,
    );
  }

  function paintPositionsOf(digit: string): void {
    for (let position = 0; position < codeLength; position += 1) {
      paintPosition(digit, position);
    }
  }

  function refresh(): void {
    for (const digit of NOTE_DIGITS) {
      paintDigit(digit);
      paintPositionsOf(digit);
    }
  }

  // ---------- 清除筆記 ----------

  const clearButton = el('button', { class: 'btn-outline btn-small notes-clear', type: 'button', text: '清除筆記' });
  clearButton.addEventListener('click', () => {
    notes.reset();
    refresh();
  });

  refresh();

  return {
    el: root,
    clearButton,
    refresh,
    setEnabled(enabled: boolean): void {
      for (const button of digitButtons.values()) button.disabled = !enabled;
      for (const cell of positionButtons.values()) cell.disabled = !enabled;
      clearButton.disabled = !enabled;
    },
  };
}

function legendItem(swatchClass: string, label: string): HTMLElement {
  return el('span', { class: 'legend-item' }, [el('i', { class: swatchClass }), label]);
}

function cellKey(digit: string, position: number): string {
  return `${digit}:${position}`;
}
