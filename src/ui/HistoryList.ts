import type { GuessRecord } from '../core';
import { el } from './dom';

export interface HistoryListHandle {
  readonly el: HTMLElement;
  render(records: readonly GuessRecord[], codeLength: number): void;
}

/**
 * 歷史紀錄。最新在最上，不做內捲，整頁自然往下長。
 */
export function createHistoryList(): HistoryListHandle {
  const list = el('div', { class: 'history' });

  return {
    el: list,
    render(records, codeLength): void {
      const rows = [...records].reverse().map((record) => createRow(record, codeLength));
      list.replaceChildren(...rows);
    },
  };
}

function createRow(record: GuessRecord, codeLength: number): HTMLElement {
  const { A, B } = record.feedback;
  const isWin = A === codeLength;

  const result = el('div', { class: 'history-result' }, [
    el('span', { class: 'res-a', text: `${A}A` }),
    el('span', { class: 'res-b', text: `${B}B` }),
  ]);

  return el('div', { class: isWin ? 'history-row is-win' : 'history-row' }, [
    el('span', { class: 'history-index', text: `#${record.index}` }),
    el('span', { class: 'history-guess', text: record.guess }),
    result,
  ]);
}
