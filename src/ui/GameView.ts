import type { CodeIssue, GameSession, RejectReason } from '../core';
import { validateCode } from '../core';
import { el, formatDuration } from './dom';
import { createConfirmDialog } from './ConfirmDialog';
import { DIFFICULTY_LABEL } from './difficulty';
import type { Difficulty } from './difficulty';
import { createGuessInput } from './GuessInput';
import { createHistoryList } from './HistoryList';
import { createNotesBoard } from './NotesBoard';
import { createPauseOverlay } from './PauseOverlay';
import { createResultOverlay } from './ResultOverlay';
import { createStatsPanel } from './StatsPanel';
import { loadStats, recordResult } from './statsStore';

const HINT_KEYBOARD = '輸入 4 個不重複的數字，可用鍵盤直接打';
const HINT_TOUCH = '輸入 4 個不重複的數字，用下方數字鍵盤輸入';

export interface GameViewOptions {
  /** 這一局的難度，用來分開統計。 */
  difficulty: Difficulty;
  /** 「再玩一次」：由外層以相同難度開新局。 */
  onRestart: () => void;
  /** 「回到選單」：由外層切回模式選擇畫面。 */
  onMenu: () => void;
}

export interface GameViewHandle {
  readonly el: HTMLElement;
  destroy(): void;
}

/**
 * 一個 GameView 綁定一個 GameSession。
 *
 * 所有狀態都來自傳入的 session（含筆記、暫停），這個元件本身不持有遊戲狀態，
 * 因此對戰時可以同時掛載兩份，互不干擾。
 *
 * 這裡拿到的是 GameSession 而不是 Codemaker —— UI 無從取得答案，
 * 只有在 session 結束後 getAnswer() 才會回傳值。
 */
export function createGameView(session: GameSession, options: GameViewOptions): GameViewHandle {
  const { codeLength } = session.config;

  const roundLabel = el('span', { class: 'meta-round' });
  const timerLabel = el('span', { class: 'meta-timer' });
  const pauseButton = el('button', { class: 'btn-outline btn-small', type: 'button', text: '暫停' });
  pauseButton.addEventListener('click', handlePause);

  const header = el('header', { class: 'header' }, [
    el('h1', { class: 'title', text: '1A2B 猜數字' }),
    el('div', { class: 'header-meta' }, [roundLabel, timerLabel, pauseButton]),
  ]);

  const history = createHistoryList();
  const input = createGuessInput({
    length: codeLength,
    onSubmit: (code) => handleSubmit(code),
  });

  // 兩種提示同時存在，由 CSS 依裝置決定顯示哪一個
  const hintKeyboard = el('span', { class: 'hint-keyboard', text: HINT_KEYBOARD });
  const hintTouch = el('span', { class: 'hint-touch', text: HINT_TOUCH });
  const hint = el('p', { class: 'hint' }, [hintKeyboard, hintTouch]);

  // 放棄按鈕只在進行中存在，所以用一個容器，結束時把按鈕拿掉
  const surrenderSlot = el('div', { class: 'surrender-slot' });
  const surrenderButton = el('button', {
    class: 'btn-outline',
    type: 'button',
    text: '放棄這一局',
  });
  surrenderButton.addEventListener('click', () => void handleSurrender());

  const notesBoard = createNotesBoard(session.notes, codeLength);
  const statsPanel = createStatsPanel(`${DIFFICULTY_LABEL[options.difficulty]}模式統計`);

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

  const result = createResultOverlay({
    onRestart: () => options.onRestart(),
    onMenu: () => options.onMenu(),
  });
  const confirm = createConfirmDialog();
  const pauseOverlay = createPauseOverlay({ onResume: handleResume });

  const root = el('div', { class: 'app' }, [
    header,
    el('div', { class: 'divider' }),
    el('div', { class: 'board' }, [leftColumn, rightColumn]),
    result.el,
    confirm.el,
    pauseOverlay.el,
  ]);

  /**
   * 實體鍵盤監聽掛在這一局的 root 上，不是 document 上。
   * 同畫面有兩局時，按鍵只會送進焦點所在的那一局。
   */
  root.addEventListener('keydown', (event: KeyboardEvent) => {
    if (session.isFinished || session.isPaused) return;

    const target = event.target;
    // 焦點在別的按鈕上時，Enter / 空白鍵留給那顆按鈕自己處理
    if (target instanceof HTMLButtonElement && !target.classList.contains('slot')) {
      if (event.key === 'Enter' || event.key === ' ') return;
    }

    input.handleKey(event);
  });

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
      showError(describeReject(outcome.reason));
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

  // ---------- 暫停 ----------

  function handlePause(): void {
    if (!session.pause()) return;
    renderTimer();
    pauseOverlay.show();
  }

  function handleResume(): void {
    if (!session.resume()) return;
    pauseOverlay.hide();
    renderTimer();
    // 「繼續」按鈕隱藏後焦點會失去著落，明確送回數字格，鍵盤才能立刻接著打
    input.focusActive();
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
    pauseButton.hidden = true;
    clearError();

    const outcome = session.status === 'won' ? 'won' : 'surrendered';
    statsPanel.render(recordResult(options.difficulty, outcome, session.guessCount));

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
    hint.replaceChildren(message);
    hint.className = 'hint is-error';
  }

  function clearError(): void {
    hint.replaceChildren(hintKeyboard, hintTouch);
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

  statsPanel.render(loadStats(options.difficulty));
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

function describeReject(reason: RejectReason): string {
  switch (reason) {
    case 'finished':
      return '這一局已經結束了';
    case 'paused':
      return '遊戲暫停中';
    case 'invalid':
    case 'duplicate':
      return '這組數字不能送出';
  }
}
