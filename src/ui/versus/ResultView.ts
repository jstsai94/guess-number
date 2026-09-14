import type { MatchReason } from '../../core';
import type { MatchView, Verification } from '../../online/match';
import { el, formatDuration } from '../dom';

export interface ResultViewOptions {
  readonly onExit: () => void;
}

export interface ResultViewHandle {
  readonly el: HTMLElement;
  /** 公開密碼與核對結果會晚一點才到，收到新狀態時更新。 */
  update(view: MatchView): void;
  destroy(): void;
}

/** 對戰結算：勝負、原因、雙方對照、核對結果；只有「回到選單」，不做再戰。 */
export function createResultView(options: ResultViewOptions): ResultViewHandle {
  const headline = el('h2', { class: 'result-headline' });
  const reason = el('p', { class: 'result-reason' });

  const myCount = el('span', { class: 'cell-value' });
  const theirCount = el('span', { class: 'cell-value' });
  const myTime = el('span', { class: 'cell-value' });
  const theirTime = el('span', { class: 'cell-value' });
  const myCode = el('span', { class: 'cell-value cell-code' });
  const theirCode = el('span', { class: 'cell-value cell-code' });

  const table = el('div', { class: 'result-table' }, [
    el('span', { class: 'cell-head' }),
    el('span', { class: 'cell-head', text: '你' }),
    el('span', { class: 'cell-head', text: '對手' }),
    el('span', { class: 'cell-label', text: '猜測次數' }),
    myCount,
    theirCount,
    el('span', { class: 'cell-label', text: '用時' }),
    myTime,
    theirTime,
    el('span', { class: 'cell-label', text: '密碼' }),
    myCode,
    theirCode,
  ]);

  const verify = el('p', { class: 'result-verify' });
  const back = el('button', { class: 'btn-primary', type: 'button', text: '回到選單' });
  back.addEventListener('click', () => options.onExit());

  const root = el('section', { class: 'panel versus-card result-card' }, [
    headline,
    reason,
    table,
    verify,
    el('div', { class: 'versus-actions' }, [back]),
  ]);

  queueMicrotask(() => back.focus());

  return {
    el: root,

    update(view): void {
      const outcome = view.outcome;
      if (outcome) {
        headline.textContent = outcome.winner === 'me' ? '你贏了' : outcome.winner === 'opponent' ? '你輸了' : '平手';
        headline.className = `result-headline ${outcome.winner === 'me' ? 'is-win' : outcome.winner === 'opponent' ? 'is-lose' : ''}`;
        reason.textContent = describeReason(outcome.reason, outcome.winner);
      }

      myCount.textContent = `${view.me.guessCount} 次`;
      theirCount.textContent = view.opponent ? `${view.opponent.guessCount} 次` : '—';
      myTime.textContent = formatElapsed(view.me.solvedElapsedMs);
      theirTime.textContent = formatElapsed(view.opponent?.solvedElapsedMs ?? null);
      myCode.textContent = view.revealed.me ?? view.mySecret ?? '—';
      theirCode.textContent = view.revealed.opponent ?? '等待公開…';

      verify.textContent = describeVerification(view.verification);
      verify.className = `result-verify ${view.verification === 'ok' ? 'is-ok' : view.verification === 'pending' ? '' : 'is-bad'}`;
    },

    destroy(): void {
      root.remove();
    },
  };
}

function formatElapsed(ms: number | null): string {
  return ms === null ? '—' : formatDuration(ms);
}

function describeReason(reason: MatchReason, winner: 'me' | 'opponent' | 'draw'): string {
  const won = winner === 'me';
  switch (reason) {
    case 'fewer-guesses':
      return won ? '你的猜測次數較少' : '對手的猜測次數較少';
    case 'faster':
      return won ? '次數相同，你的用時較短' : '次數相同，對手的用時較短';
    case 'exact-tie':
      return '次數與用時都相同';
    case 'reached-limit':
      return won ? '你先猜中，對手的次數已經追不上' : '對手先猜中，你的次數已經追不上';
    case 'surrender':
      return won ? '對手放棄' : '你放棄了';
    case 'disconnect':
      return won ? '對手連線中斷' : '你的連線中斷太久';
    case 'judge-timeout':
      return won ? '對手太久沒有判定你的猜測' : '你太久沒有判定對手的猜測';
    case 'cheated':
      return won ? '對手回報的結果不實' : '你回報的結果與密碼不符';
    case 'both-forfeited':
      return '雙方都棄權';
    case 'both-cheated':
      return '雙方回報的結果都不實';
  }
}

function describeVerification(verification: Verification): string {
  switch (verification) {
    case 'pending':
      return '正在核對雙方的回饋…';
    case 'ok':
      return '雙方回饋核對無誤';
    case 'opponent-cheated':
      return '對手回報的結果與公開的密碼不符';
    case 'me-cheated':
      return '你的回報與公開的密碼不符';
    case 'both-cheated':
      return '雙方的回報都與公開的密碼不符';
  }
}
