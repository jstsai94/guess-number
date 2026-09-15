import { validateCode } from '../../core';
import type { CodeIssue, GameSession, RejectReason, SubmitResult } from '../../core';
import type { MatchView, VersusMatch } from '../../online/match';
import { createConfirmDialog } from '../ConfirmDialog';
import { el, formatDuration } from '../dom';
import { createGuessInput } from '../GuessInput';
import { createHistoryList } from '../HistoryList';
import { createNotesBoard } from '../NotesBoard';

const HINT_KEYBOARD = '輸入 4 個不重複的數字，可用鍵盤直接打';
const HINT_TOUCH = '輸入 4 個不重複的數字，用下方數字鍵盤輸入';
const CODE_LENGTH = 4;

export interface VersusGameViewOptions {
  readonly match: VersusMatch;
  /** 這一局的答案是對手的密碼（OpponentCodemaker）。 */
  readonly session: GameSession;
}

export interface VersusGameViewHandle {
  readonly el: HTMLElement;
  update(view: MatchView): void;
  destroy(): void;
}

/**
 * 對戰中（互相出題）。版面與單人模式相同，差異：
 * - 頂部顯示房號、第 N 次、計時器，沒有暫停
 * - 右欄上方是「對手」面板，筆記板在它下面，不顯示統計
 * - 送出後要等對手的裝置判定，提示列顯示「判定中…」
 */
export function createVersusGameView(options: VersusGameViewOptions): VersusGameViewHandle {
  const { match, session } = options;
  let latest: MatchView | null = null;
  let judging = false;

  // ---------- 頂部 ----------

  const roundLabel = el('span', { class: 'meta-round' });
  const timerLabel = el('span', { class: 'meta-timer' });
  // 連線對戰沒有暫停，放棄放在猜電腦「暫停」按鈕的同一個位置
  const surrenderButton = el('button', { class: 'btn-outline btn-small', type: 'button', text: '放棄' });
  surrenderButton.addEventListener('click', () => void handleSurrender());
  const meta = el('div', { class: 'header-meta versus-meta' }, [
    el('span', { class: 'meta-room', text: `房號 ${match.roomCode}` }),
    roundLabel,
    timerLabel,
    surrenderButton,
  ]);

  // ---------- 左欄：自己的猜測 ----------

  const history = createHistoryList();
  const input = createGuessInput({ length: CODE_LENGTH, onSubmit: (code) => void handleSubmit(code) });

  const hintKeyboard = el('span', { class: 'hint-keyboard', text: HINT_KEYBOARD });
  const hintTouch = el('span', { class: 'hint-touch', text: HINT_TOUCH });
  const hint = el('p', { class: 'hint' }, [hintKeyboard, hintTouch]);

  const solvedNotice = el('div', { class: 'versus-solved', hidden: true }, [
    el('div', { class: 'versus-solved-title', text: '你猜中了！' }),
    el('div', { class: 'versus-solved-text', text: '等待對手…' }),
  ]);

  const leftColumn = el('section', { class: 'panel panel-left' }, [
    solvedNotice,
    input.el,
    hint,
    history.el,
  ]);

  // ---------- 右欄：對手與筆記 ----------

  const opponentState = el('div', { class: 'opponent-state' });
  const opponentCount = el('div', { class: 'opponent-count' });
  const mySecretLabel = el('div', { class: 'opponent-my-secret', hidden: true });
  const opponentGuesses = el('div', { class: 'opponent-guesses' });

  const opponentPanel = el('section', { class: 'panel opponent-panel' }, [
    el('h2', { class: 'panel-title', text: '對手' }),
    el('div', { class: 'opponent-summary' }, [opponentState, opponentCount]),
    mySecretLabel,
    el('div', { class: 'notes-section-title', text: '對手猜你的密碼' }),
    opponentGuesses,
  ]);

  const notesBoard = createNotesBoard(session.notes, CODE_LENGTH);
  const notesPanel = el('aside', { class: 'panel' }, [el('h2', { class: 'panel-title', text: '筆記板' }), notesBoard.el]);

  const confirm = createConfirmDialog();

  const root = el('div', { class: 'versus-game' }, [
    meta,
    el('div', { class: 'board' }, [leftColumn, el('div', { class: 'versus-right' }, [opponentPanel, notesPanel])]),
    confirm.el,
  ]);

  // 實體鍵盤監聽掛在這一局的容器上，不是 document 上
  root.addEventListener('keydown', (event: KeyboardEvent) => {
    if (session.isFinished) return;
    const target = event.target;
    if (target instanceof HTMLButtonElement && !target.classList.contains('slot')) {
      if (event.key === 'Enter' || event.key === ' ') return;
    }
    input.handleKey(event);
  });

  // ---------- 送出 ----------

  async function handleSubmit(code: string): Promise<void> {
    if (judging || session.isFinished) return;

    const issue = validateCode(code, session.config);
    if (issue !== null) {
      showError(describeIssue(issue));
      if (issue === 'duplicate-digit') resetInput();
      return;
    }
    if (session.hasGuessed(code)) {
      showError('這組數字已經猜過了');
      resetInput();
      return;
    }

    // 不停用輸入區：停用會讓焦點跑掉、實體鍵盤打不了字；重複送出由 GameSession 以 pending 擋下
    judging = true;
    showHint('判定中…');

    let outcome: SubmitResult;
    try {
      outcome = await session.submitGuess(code);
    } catch {
      judging = false;
      showError('判定失敗，請再送出一次');
      return;
    }
    judging = false;

    if (!outcome.ok) {
      showError(describeReject(outcome.reason));
      return;
    }

    clearHint();
    resetInput();
    renderMine();

    const { A, B } = outcome.record.feedback;
    if (A === 0 && B === 0 && !session.isFinished) void offerExclude(outcome.record.guess);
  }

  // ---------- 放棄 ----------

  async function handleSurrender(): Promise<void> {
    const confirmed = await confirm.ask({
      title: '確定要放棄這一局嗎？',
      message: '連線對戰中放棄會直接判負。',
      confirmText: '確定放棄',
      cancelText: '再想想',
    });
    if (!confirmed) {
      input.focusActive();
      return;
    }

    try {
      await match.surrender();
    } catch {
      showError('無法放棄，請再試一次');
      return;
    }
    session.surrender();
    renderMine();
  }

  // ---------- 0A0B 自動輔助（與單人模式相同） ----------

  async function offerExclude(guess: string): Promise<void> {
    const confirmed = await confirm.ask({
      title: '要把這 4 個數字標記為排除嗎？',
      message: `${[...guess].join(' ')} 都不在答案裡。`,
      confirmText: '標記排除',
      cancelText: '不用',
    });
    if (confirmed) {
      session.notes.excludeAll(guess);
      notesBoard.refresh();
    }
    input.focusActive();
  }

  // ---------- 渲染 ----------

  function resetInput(): void {
    input.clear();
    input.focusFirst();
  }

  function showHint(message: string): void {
    hint.replaceChildren(message);
    hint.className = 'hint';
  }

  function showError(message: string): void {
    hint.replaceChildren(message);
    hint.className = 'hint is-error';
  }

  function clearHint(): void {
    hint.replaceChildren(hintKeyboard, hintTouch);
    hint.className = 'hint';
  }

  function renderMine(): void {
    const done = session.isFinished;
    roundLabel.textContent = `第 ${done ? session.guessCount : session.guessCount + 1} 次`;
    history.render(session.guesses, CODE_LENGTH);
    solvedNotice.hidden = session.status !== 'won';
    leftColumn.classList.toggle('is-done', done);
    surrenderButton.hidden = done;
    input.setEnabled(!done);
  }

  function renderOpponent(view: MatchView): void {
    mySecretLabel.hidden = view.mySecret === null;
    mySecretLabel.textContent = view.mySecret ? `你的密碼　${view.mySecret}` : '';

    const opponent = view.opponent;
    if (!opponent) return;

    opponentState.textContent = opponent.surrendered ? '已放棄' : opponent.solved ? '已猜中' : '猜測中';
    opponentState.className = 'opponent-state';
    if (opponent.solved) opponentState.classList.add('is-solved');
    if (opponent.surrendered) opponentState.classList.add('is-gone');
    opponentCount.textContent = `已猜 ${opponent.guessCount} 次`;

    const total = opponent.guesses.length;
    const rows = [...opponent.guesses].reverse().map((g, i) => {
      const result = g.feedback
        ? el('span', { class: 'history-result' }, [
            el('span', { class: 'res-a', text: `${g.feedback.A}A` }),
            el('span', { class: 'res-b', text: `${g.feedback.B}B` }),
          ])
        : el('span', { class: 'opponent-pending', text: '判定中…' });
      const win = g.feedback !== null && g.feedback.A === CODE_LENGTH;
      return el('div', { class: win ? 'history-row is-compact is-win' : 'history-row is-compact' }, [
        el('span', { class: 'history-index', text: `#${total - i}` }),
        el('span', { class: 'history-guess', text: g.guess }),
        result,
      ]);
    });

    opponentGuesses.replaceChildren(
      ...(rows.length > 0 ? rows : [el('p', { class: 'opponent-empty', text: '對手還沒有猜' })]),
    );
  }

  function renderTimer(): void {
    if (session.isFinished) return;
    const start = latest?.startedAtMs;
    timerLabel.textContent = formatDuration(start ? Date.now() - start : 0);
  }

  const timer = setInterval(renderTimer, 1000);
  renderMine();
  renderTimer();
  queueMicrotask(() => input.focusFirst());

  return {
    el: root,

    update(view): void {
      latest = view;
      renderOpponent(view);
      renderTimer();
    },

    destroy(): void {
      clearInterval(timer);
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
