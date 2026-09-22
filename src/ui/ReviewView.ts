import type { Code, GameReview, GameStatus, GuessRecord, ReviewStep } from '../core';
import { reviewGame } from '../core';
import type { Difficulty } from './difficulty';
import { el } from './dom';

const CODE_LENGTH = 4;

export interface ReviewViewOptions {
  readonly difficulty: Difficulty;
  /** 這一局玩家的猜測紀錄。 */
  readonly guesses: readonly GuessRecord[];
  /** 結束後揭曉的答案。 */
  readonly answer: Code;
  /** 這一局是猜中還是放棄：影響總結的說法。 */
  readonly outcome: Exclude<GameStatus, 'playing'>;
  /** 「再玩一次」：由外層以相同難度開新局。 */
  readonly onRestart: () => void;
  readonly onMenu: () => void;
}

export interface ReviewViewHandle {
  readonly el: HTMLElement;
  destroy(): void;
}

/**
 * 復盤：一局結束後回頭看每一步縮小了多少範圍，以及同樣情況下電腦會怎麼猜。
 *
 * 分析由 core 的 reviewGame 算出來（純邏輯）；這裡只負責排版與中文說明。
 */
export function createReviewView(options: ReviewViewOptions): ReviewViewHandle {
  const { difficulty, guesses, answer, outcome } = options;
  let destroyed = false;

  const summary = el('div', { class: 'review-summary' });
  const list = el('div', { class: 'history review-history' });
  const detail = el('div', { class: 'review-detail' });

  const restartButton = el('button', { class: 'btn-primary', type: 'button', text: '再玩一次' });
  restartButton.addEventListener('click', () => options.onRestart());
  const menuButton = el('button', { class: 'btn-outline', type: 'button', text: '回到選單' });
  menuButton.addEventListener('click', () => options.onMenu());

  const left = el('section', { class: 'panel panel-left' }, [
    summary,
    el('div', { class: 'review-actions' }, [restartButton, menuButton]),
    list,
  ]);

  const right = el('aside', { class: 'panel panel-right' }, [
    el('h2', { class: 'panel-title', text: '這一步的分析' }),
    detail,
  ]);

  const root = el('div', { class: 'app app-game review' }, [
    el('header', { class: 'header' }, [
      el('h1', { class: 'title', text: '1A2B 猜數字' }),
      el('div', { class: 'header-meta' }, [
        el('span', { class: 'review-title', text: '復盤' }),
        el('span', { class: 'review-answer', text: `答案 ${answer}` }),
      ]),
    ]),
    el('div', { class: 'divider' }),
    el('div', { class: 'board' }, [left, right]),
  ]);

  let review: GameReview | null = null;
  let selected = 0;

  function render(): void {
    if (!review) return;

    summary.replaceChildren(...renderSummary(review, difficulty, outcome));

    const rows = [...review.steps]
      .reverse()
      .map((step) => createRow(step, step.index === selected, review!.biggestMissIndex === step.index));
    list.replaceChildren(...rows);

    const step = review.steps.find((s) => s.index === selected);
    detail.replaceChildren(
      ...(step
        ? renderStep(step)
        : [el('p', { class: 'solver-empty', text: '這一局沒有猜過任何一組，沒有可以復盤的步驟。' })]),
    );
  }

  function createRow(step: ReviewStep, isSelected: boolean, isBiggestMiss: boolean): HTMLElement {
    const { A, B } = step.feedback;
    const classes = ['history-row', 'review-row'];
    if (A === CODE_LENGTH) classes.push('is-win');
    if (isSelected) classes.push('is-selected');

    const children: (HTMLElement | string)[] = [
      el('span', { class: 'history-index', text: `#${step.index}` }),
      el('span', { class: 'history-guess', text: step.guess }),
    ];
    if (isBiggestMiss) children.push(el('span', { class: 'review-flag', text: '最可惜' }));
    children.push(
      el('span', { class: 'history-result' }, [
        el('span', { class: 'res-a', text: `${A}A` }),
        el('span', { class: 'res-b', text: `${B}B` }),
      ]),
    );

    const row = el(
      'button',
      { class: classes.join(' '), type: 'button', 'aria-pressed': isSelected ? 'true' : 'false' },
      children,
    );
    row.addEventListener('click', () => {
      selected = step.index;
      render();
    });
    return row;
  }

  // 分析要算一小段時間：先把「分析中」畫出來再算（計時器而不是 rAF，背景分頁也會執行）
  summary.replaceChildren(el('p', { class: 'solver-empty', text: '分析中…' }));
  setTimeout(() => {
    if (destroyed) return;
    review = reviewGame(guesses, answer);
    selected = review.biggestMissIndex ?? review.steps[0]?.index ?? 0;
    render();
    restartButton.focus();
  }, 50);

  return {
    el: root,
    destroy(): void {
      destroyed = true;
      root.remove();
    },
  };
}

// ---------- 文字 ----------

function renderSummary(
  review: GameReview,
  difficulty: Difficulty,
  outcome: Exclude<GameStatus, 'playing'>,
): HTMLElement[] {
  if (review.steps.length === 0) {
    return [el('p', { class: 'review-line', text: '這一局沒有猜過任何一組。' })];
  }

  // 放棄的局沒有猜完，不能只寫「你用 N 次」，否則看起來像贏過電腦
  const lines = [
    outcome === 'won'
      ? `你用 ${review.yourGuessCount} 次猜中，電腦解同一組答案要 ${review.solverGuessCount} 次。`
      : `你猜了 ${review.yourGuessCount} 次之後放棄，電腦解同一組答案要 ${review.solverGuessCount} 次。`,
  ];

  const miss = review.steps.find((step) => step.index === review.biggestMissIndex);
  lines.push(
    miss
      ? `最可惜的是第 ${miss.index} 次：當時還剩 ${miss.candidatesBefore} 組，你的猜法最壞剩 ${miss.worst} 組，電腦的選擇最壞只剩 ${miss.bestWorst} 組。`
      : '每一步都和電腦一樣好。',
  );

  const parts = lines.map((text) => el('p', { class: 'review-line', text }));
  if (difficulty === 'devil') {
    parts.push(
      el('p', {
        class: 'review-note',
        text: '惡魔模式會挑讓你最難縮小範圍的回饋，剩餘組數是依實際得到的回饋計算；電腦的次數以最後揭曉的答案計算，僅供參考。',
      }),
    );
  }
  return parts;
}

function renderStep(step: ReviewStep): HTMLElement[] {
  const { A, B } = step.feedback;

  const thisStep = [
    `猜之前還有 ${step.candidatesBefore} 組可能，猜完剩 ${step.candidatesAfter} 組。`,
    `你這組猜法最壞會剩 ${step.worst} 組。`,
  ];
  if (!step.wasPossible) thisStep.push('這組在猜的當下已經不可能是答案了。');

  const computer = step.sameAsBest
    ? step.bestGuess === step.guess
      ? `電腦也會猜 ${step.bestGuess}，最壞剩 ${step.bestWorst} 組 —— 這一步你和電腦一樣好。`
      : `電腦會猜 ${step.bestGuess}，最壞也是剩 ${step.bestWorst} 組 —— 你的選擇一樣好。`
    : `電腦會猜 ${step.bestGuess}，最壞只剩 ${step.bestWorst} 組；你這組最壞剩 ${step.worst} 組。`;

  return [
    el('div', { class: 'solver-step-head' }, [
      el('span', { class: 'solver-step-label', text: `第 ${step.index} 次猜` }),
      el('span', { class: 'history-guess', text: step.guess }),
      el('span', { class: 'history-result' }, [
        el('span', { class: 'res-a', text: `${A}A` }),
        el('span', { class: 'res-b', text: `${B}B` }),
      ]),
    ]),
    el('div', { class: 'notes-section-title', text: '這一步' }),
    list(thisStep),
    el('div', { class: 'notes-section-title', text: '電腦的選擇' }),
    list([computer]),
  ];
}

function list(items: readonly string[]): HTMLElement {
  return el(
    'ul',
    { class: 'solver-list' },
    items.map((text) => el('li', { text })),
  );
}
