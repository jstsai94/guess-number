import { el, formatDuration } from './dom';
import type { Stats } from './statsStore';

export interface StatsPanelHandle {
  readonly el: HTMLElement;
  render(stats: Stats): void;
}

/**
 * 統計區：上方一條分隔線，一行小字標示是哪個難度的統計，下面三行左右對齊的小字。
 */
export function createStatsPanel(caption: string): StatsPanelHandle {
  const totalValue = el('span', { class: 'stat-value' });
  const winsValue = el('span', { class: 'stat-value' });
  const bestValue = el('span', { class: 'stat-value' });

  const root = el('div', { class: 'stats' }, [
    el('div', { class: 'divider divider-tight' }),
    el('div', { class: 'stats-caption', text: caption }),
    row('總局數', totalValue),
    row('勝場', winsValue),
    row('最佳紀錄', bestValue),
  ]);

  return {
    el: root,
    render(stats): void {
      totalValue.textContent = `${stats.total}`;
      winsValue.textContent = `${stats.wins}`;
      // 最佳紀錄含用時，例如「4 次 · 01:23」；舊紀錄沒有時間時只顯示次數
      bestValue.textContent =
        stats.bestGuessCount === null
          ? '—'
          : stats.bestElapsedMs === null
            ? `${stats.bestGuessCount} 次`
            : `${stats.bestGuessCount} 次 · ${formatDuration(stats.bestElapsedMs)}`;
    },
  };
}

function row(label: string, value: HTMLElement): HTMLElement {
  return el('div', { class: 'stat-row' }, [el('span', { class: 'stat-label', text: label }), value]);
}
