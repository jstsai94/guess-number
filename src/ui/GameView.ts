import type { CodeIssue, GameSession } from '../core';
import { validateCode } from '../core';
import { el, formatDuration } from './dom';
import { createConfirmDialog } from './ConfirmDialog';
import { createGuessInput } from './GuessInput';
import { createHistoryList } from './HistoryList';
import { createNotesBoard } from './NotesBoard';
import { createResultOverlay } from './ResultOverlay';
import { createStatsPanel } from './StatsPanel';
import { loadStats, recordResult } from './statsStore';

const HINT_TEXT = '輸入 4 個不重複的數字，可用鍵盤直接打';

export interface GameViewOptions {
  /** 「再玩一次」時由外層負責開新局。 */
  onRestart: () => void;
}

export interface GameViewHandle {
  readonly el: HTMLElement;
  destroy(): void;
}

/**
 * 一個 GameView 綁定一個 GameSession。
 *
 * 所有狀態都來自傳入的 session（含筆記），這個元件本身不持有遊戲狀態，
 * 因此未來雙人對戰時可以同時掛載兩份，互不干擾。
 *
 * 這裡拿到的是 GameSession 而不是 Codemaker —— UI 無從取得答案，
 * 只有在 session 結束後 getAnswer() 才會回傳值。
 */
export function createGameView(session: GameSession, options: GameViewOptions): GameViewHandle {
  const { codeLength } = session.config;

  const roundLabel = el('span', { class: 'meta-round' });
  const timerLabel = el('span', { class: 'meta-timer' });

  const header = el('header', { class: 'header' }, [
    el('h1', { class: 'title', text: '1A2B 猜數字' }),
    el('div', { class: 'header-meta' }, [roundLabel, timerLabel]),
  ]);

  const history = createHistoryList();
  const input = createGuessInput({
    length: codeLength,
    onSubmit: (code) => handleSubmit(code),
  });

  const hint = el('p', { class: 'hint', text: HINT_TEXT });

  // 放棄按鈕在第 10 次猜測前「不存在」，所以用一個空容器，需要時才把按鈕放進去
  const surrenderSlot = el('div', { class: 'surrender-slot' });
  const surrenderButton = el('button', {
    class: 'btn-outline',
    type: 'button',
    text: '放棄這一局',
  });
  surrenderButton.addEventListener('click', () => void handleSurrender());

  const notesBoard = createNotesBoard(session.notes, codeLength);
  const statsPanel = createStatsPanel();

  const leftColumn = el('section', { class: 'panel panel-left' }, [
    input.el,
    hint,
    surrenderSlot,
    history.el,
  ]);

  const rightColumn = el('aside', { class: 'panel panel-right' }, [
    el('h2', { class: 'panel-title', text: '筆記板' }),
    notesBoard.el,
    statsPanel.el,
  ]);

  const result = createResultOverlay({ onRestart: () => options.onRestart() });
  const confirm = createConfirmDialog();

  const root = el('div', { class: 'app' }, [
    header,
    el('div', { class: 'divider' }),
    el('div', { class: 'board' }, [leftColumn, rightColumn]),
    result.el,
    confirm.el,
  ]);

  // ---------- 送出 ----------

  function handleSubmit(code: string): void {
    const issue = validateCode(code, session.config);
    if (issue !== null) {
      showError(describeIssue(issue));
      // 數字重複時整排清掉重打，不必一格一格退
      if (issue === 'duplicate-digit') resetInput();
      return;
    }
    if (session.hasGuessed(code)) {
      showError('這組數字已經猜過了');
      resetInput();
      return;
    }

    const outcome = session.submitGuess(code);
    if (!outcome.ok) {
      // 理論上到不了這裡，前面已經擋掉；保險起見仍給一則訊息
      showError(outcome.reason === 'finished' ? '這一局已經結束了' : '這組數字不能送出');
      return;
    }

    clearError();
    resetInput();
    render();

    const { A, B } = outcome.record.feedback;
    if (session.status === 'won') {
      finish();
      return;
    }
    if (A === 0 && B === 0) {
      void offerExclude(outcome.record.guess);
    }
  }

  // ---------- 放棄 ----------

  async function handleSurrender(): Promise<void> {
    const confirmed = await confirm.ask({
      title: '確定要放棄這一局嗎？',
      message: '放棄後會直接揭曉答案，本局在統計上記為放棄。',
      confirmText: '確定放棄',
      cancelText: '再想想',
    });
    if (!confirmed) return;
    if (!session.surrender()) return;

    render();
    finish();
  }

  // ---------- 0A0B 自動輔助 ----------

  async function offerExclude(guess: string): Promise<void> {
    const confirmed = await confirm.ask({
      title: '要把這 4 個數字標記為排除嗎？',
      message: `${[...guess].join(' ')} 都不在答案裡。`,
      confirmText: '標記排除',
      cancelText: '不用',
    });
    if (!confirmed) return;

    session.notes.excludeAll(guess);
    notesBoard.refresh();
  }

  // ---------- 結算 ----------

  function finish(): void {
    stopTimer();
    input.setEnabled(false);
    clearError();

    const outcome = session.status === 'won' ? 'won' : 'surrendered';
    statsPanel.render(recordResult(outcome, session.guessCount));

    result.show({
      outcome,
      guessCount: session.guessCount,
      elapsedMs: session.elapsedMs,
      answer: session.getAnswer() ?? '',
    });
  }

  // ---------- 渲染 ----------

  /** 清空四格並把游標送回第一格。 */
  function resetInput(): void {
    input.clear();
    input.focusFirst();
  }

  function showError(message: string): void {
    hint.textContent = message;
    hint.className = 'hint is-error';
  }

  function clearError(): void {
    hint.textContent = HINT_TEXT;
    hint.className = 'hint';
  }

  function render(): void {
    const round = session.isFinished ? session.guessCount : session.guessCount + 1;
    roundLabel.textContent = `第 ${round} 次`;
    history.render(session.guesses, codeLength);
    renderSurrender();
    renderTimer();
  }

  function renderSurrender(): void {
    const shouldShow = session.canSurrender;
    const isShown = surrenderSlot.contains(surrenderButton);
    if (shouldShow && !isShown) surrenderSlot.append(surrenderButton);
    else if (!shouldShow && isShown) surrenderButton.remove();
  }

  function renderTimer(): void {
    timerLabel.textContent = formatDuration(session.elapsedMs);
  }

  // ---------- 計時器 ----------

  let timerId: ReturnType<typeof setInterval> | null = null;

  function startTimer(): void {
    if (timerId !== null) return;
    timerId = setInterval(renderTimer, 1000);
  }

  function stopTimer(): void {
    if (timerId === null) return;
    clearInterval(timerId);
    timerId = null;
  }

  statsPanel.render(loadStats());
  render();
  startTimer();
  queueMicrotask(() => input.focusFirst());

  return {
    el: root,
    destroy(): void {
      stopTimer();
      confirm.close();
      root.remove();
    },
  };
}

function describeIssue(issue: CodeIssue): string {
  switch (issue) {
    case 'length':
      return '請輸入 4 個數字';
    case 'non-digit':
      return '只能輸入 0-9 的數字';
    case 'duplicate-digit':
      return '4 個數字不能重複';
  }
}
