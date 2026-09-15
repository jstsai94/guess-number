import type { CodeIssue, GameSession, RejectReason, SubmitResult } from '../core';
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
import { countsTowardStats, loadStats, recordResult } from './statsStore';

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
    onSubmit: (code) => void handleSubmit(code),
  });

  // 兩種提示同時存在，由 CSS 依裝置決定顯示哪一個
  const hintKeyboard = el('span', { class: 'hint-keyboard', text: HINT_KEYBOARD });
  const hintTouch = el('span', { class: 'hint-touch', text: HINT_TOUCH });
  const hint = el('p', { class: 'hint' }, [hintKeyboard, hintTouch]);

  const notesBoard = createNotesBoard(session.notes, codeLength);
  const statsPanel = createStatsPanel(`${DIFFICULTY_LABEL[options.difficulty]}模式統計`);

  const leftColumn = el('section', { class: 'panel panel-left' }, [
    input.el,
    hint,
    history.el,
  ]);

  const rightColumn = el('aside', { class: 'panel panel-right' }, [
    el('div', { class: 'panel-head' }, [el('h2', { class: 'panel-title', text: '筆記板' }), notesBoard.clearButton]),
    notesBoard.el,
    statsPanel.el,
  ]);

  const result = createResultOverlay({
    onRestart: () => options.onRestart(),
    onMenu: () => options.onMenu(),
  });
  const confirm = createConfirmDialog();
  const pauseOverlay = createPauseOverlay({
    onResume: handleResume,
    onSurrender: () => void handleSurrender(),
  });

  // 放棄是從暫停畫面發起的，二次確認必須疊在暫停畫面之上，所以排在它後面
  // app-game：桌機上固定在一個視窗內，不出現頁面捲軸（見 styles.css）
  const root = el('div', { class: 'app app-game' }, [
    header,
    el('div', { class: 'divider' }),
    el('div', { class: 'board' }, [leftColumn, rightColumn]),
    result.el,
    pauseOverlay.el,
    confirm.el,
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

  async function handleSubmit(code: string): Promise<void> {
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

    let outcome: SubmitResult;
    try {
      outcome = await session.submitGuess(code);
    } catch {
      // 本地模式不會發生；連線對戰時可能因為網路中斷而判定失敗，這組數字不計次、可以重送
      showError('判定失敗，請再送出一次');
      return;
    }
    if (!outcome.ok) {
      showError(describeReject(outcome.reason));
      return;
    }

    clearError();
    resetInput();
    render();

    const { A, B } = outcome.record.feedback;
    if (session.status === 'won') {
      await finish();
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

  // ---------- 放棄（從暫停畫面發起） ----------

  async function handleSurrender(): Promise<void> {
    const confirmed = await confirm.ask({
      title: '確定要放棄這一局嗎？',
      message: countsTowardStats('surrendered', session.guessCount)
        ? '放棄後會直接揭曉答案，本局在統計上記為放棄。'
        : '放棄後會直接揭曉答案。還沒猜到 2 次，這一局不列入統計。',
      confirmText: '確定放棄',
      cancelText: '再想想',
    });
    if (!confirmed || !session.surrender()) {
      // 回到暫停畫面，焦點送回「繼續」
      if (session.isPaused) pauseOverlay.show();
      return;
    }

    pauseOverlay.hide();
    render();
    await finish();
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

  async function finish(): Promise<void> {
    stopTimer();
    input.setEnabled(false);
    pauseButton.hidden = true;
    clearError();

    const outcome = session.status === 'won' ? 'won' : 'surrendered';
    statsPanel.render(recordResult(options.difficulty, outcome, session.guessCount, session.elapsedMs));

    const answer = (await session.getAnswer()) ?? '';
    result.show({
      outcome,
      guessCount: session.guessCount,
      elapsedMs: session.elapsedMs,
      answer,
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
    renderTimer();
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
    case 'pending':
      return '上一次猜測還在判定中';
    case 'invalid':
    case 'duplicate':
      return '這組數字不能送出';
  }
}
