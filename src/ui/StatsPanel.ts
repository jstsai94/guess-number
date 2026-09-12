import { el } from './dom';
import type { Stats } from './statsStore';

export interface StatsPanelHandle {
  readonly el: HTMLElement;
  render(stats: Stats): void;
}

/** 統計區：上方一條分隔線，下面三行左右對齊的小字。 */
export function createStatsPanel(): StatsPanelHandle {
  const totalValue = el('span', { class: 'stat-value' });
  const winsValue = el('span', { class: 'stat-value' });
  const bestValue = el('span', { class: 'stat-value' });

  const root = el('div', { class: 'stats' }, [
    el('div', { class: 'divider divider-tight' }),
    row('總局數', totalValue),
    row('勝場', winsValue),
    row('最佳紀錄', bestValue),
  ]);

  return {
    el: root,
    render(stats): void {
      totalValue.textContent = `${stats.total}`;
      winsValue.textContent = `${stats.wins}`;
      bestValue.textContent = stats.bestGuessCount === null ? '—' : `${stats.bestGuessCount} 次`;
    },
  };
}

function row(label: string, value: HTMLElement): HTMLElement {
  return el('div', { class: 'stat-row' }, [el('span', { class: 'stat-label', text: label }), value]);
}
