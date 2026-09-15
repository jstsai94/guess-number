import type { CodeIssue, Conclusion, Reading, SolverStep } from '../core';
import { solveCode, validateCode } from '../core';
import { el } from './dom';
import { createGuessInput } from './GuessInput';

const HINT_KEYBOARD = '輸入 4 個不重複的數字，可用鍵盤直接打';
const HINT_TOUCH = '輸入 4 個不重複的數字，用下方數字鍵盤輸入';
const CODE_LENGTH = 4;
/** 自動播放每一步的間隔。 */
const AUTOPLAY_MS = 1500;

export interface SolverViewOptions {
  /** 「再出一題」：由外層重新開一個電腦解題畫面。 */
  onRestart: () => void;
  onMenu: () => void;
}

export interface SolverViewHandle {
  readonly el: HTMLElement;
  destroy(): void;
}

/**
 * 電腦解題：玩家出一組密碼，電腦一步步猜，每一步說明這次回饋推出了什麼。
 *
 * 流程：輸入密碼 → 電腦算出解題過程 → 一步一步看（下一步／自動播放／看完整過程）→ 猜中
 *
 * 密碼是玩家自己出的，所以畫面上可以直接顯示；幾A幾B由 core 自動判定。
 */
export function createSolverView(options: SolverViewOptions): SolverViewHandle {
  const root = el('div', { class: 'app solver' });
  let destroyed = false;
  let autoplayId: ReturnType<typeof setInterval> | null = null;
  let onKey: ((event: KeyboardEvent) => void) | null = null;

  // 實體鍵盤只在輸入密碼時使用；監聽掛在這個畫面上，不是 document 上
  root.addEventListener('keydown', (event: KeyboardEvent) => onKey?.(event));

  function headerParts(meta: readonly HTMLElement[] = []): HTMLElement[] {
    return [
      el('header', { class: 'header' }, [
        el('h1', { class: 'title', text: '1A2B 猜數字' }),
        el('div', { class: 'header-meta' }, meta),
      ]),
      el('div', { class: 'divider' }),
    ];
  }

  function stopAutoplay(): void {
    if (autoplayId === null) return;
    clearInterval(autoplayId);
    autoplayId = null;
  }

  // ---------- ① 輸入密碼 ----------

  function showSetup(): void {
    root.className = 'app solver';

    const input = createGuessInput({
      length: CODE_LENGTH,
      submitLabel: '開始',
      onSubmit: (code) => start(code),
    });

    const hintKeyboard = el('span', { class: 'hint-keyboard', text: HINT_KEYBOARD });
    const hintTouch = el('span', { class: 'hint-touch', text: HINT_TOUCH });
    const hint = el('p', { class: 'hint' }, [hintKeyboard, hintTouch]);

    const back = el('button', { class: 'btn-ghost', type: 'button', text: '回到選單' });
    back.addEventListener('click', () => options.onMenu());

    const panel = el('section', { class: 'panel panel-left solver-setup' }, [
      el('h2', { class: 'panel-title', text: '電腦解題' }),
      el('p', {
        class: 'solver-intro',
        text: '出一組密碼給電腦猜。電腦每猜一次，都會說明這次的回饋推出了什麼，可以對照自己的推理。',
      }),
      input.el,
      hint,
      el('div', { class: 'solver-setup-actions' }, [back]),
    ]);

    root.replaceChildren(...headerParts(), panel);

    function start(code: string): void {
      const issue = validateCode(code);
      if (issue !== null) {
        hint.replaceChildren(describeIssue(issue));
        hint.className = 'hint is-error';
        // 數字重複時整排清掉重打，與猜數字相同
        if (issue === 'duplicate-digit') {
          input.clear();
          input.focusFirst();
        }
        return;
      }
      onKey = null;
      showSolving(code);
    }

    onKey = (event) => {
      const target = event.target;
      // 焦點在「回到選單」這類按鈕上時，Enter / 空白鍵留給按鈕自己
      if (target instanceof HTMLButtonElement && !target.classList.contains('slot')) {
        if (event.key === 'Enter' || event.key === ' ') return;
      }
      input.handleKey(event);
    };

    queueMicrotask(() => input.focusFirst());
  }

  // ---------- ② 解題過程 ----------

  function showSolving(secret: string): void {
    // app-game：桌機上固定在一個視窗內，紀錄在區塊內捲動
    root.className = 'app app-game solver';

    const roundLabel = el('span', { class: 'meta-round' });

    const nextButton = el('button', { class: 'btn-primary', type: 'button', text: '下一步' });
    const autoButton = el('button', { class: 'btn-outline', type: 'button', text: '自動播放' });
    const allButton = el('button', { class: 'btn-outline', type: 'button', text: '看完整過程' });
    const controls = el('div', { class: 'solver-controls' }, [nextButton, autoButton, allButton]);

    const doneTitle = el('div', { class: 'solver-done-title' });
    const againButton = el('button', { class: 'btn-primary', type: 'button', text: '再出一題' });
    const menuButton = el('button', { class: 'btn-outline', type: 'button', text: '回到選單' });
    const done = el('div', { class: 'solver-done', hidden: true }, [
      doneTitle,
      el('div', { class: 'solver-done-actions' }, [againButton, menuButton]),
    ]);

    const empty = el('p', { class: 'solver-empty', text: '按「下一步」看電腦的第一次猜測。' });
    const list = el('div', { class: 'history solver-history' });
    const explain = el('div', { class: 'solver-explain' });

    const left = el('section', { class: 'panel panel-left' }, [controls, done, empty, list]);
    const right = el('aside', { class: 'panel panel-right' }, [
      el('h2', { class: 'panel-title', text: '推理說明' }),
      explain,
    ]);

    root.replaceChildren(
      ...headerParts([el('span', { class: 'solver-secret', text: `你的密碼 ${secret}` }), roundLabel]),
      el('div', { class: 'board' }, [left, right]),
    );

    let steps: SolverStep[] = [];
    /** 已經揭曉到第幾步（0 = 還沒開始）。 */
    let shown = 0;
    /** 右欄正在看第幾步（0 = 還沒開始）。 */
    let selected = 0;

    const isFinished = (): boolean => steps.length > 0 && shown === steps.length;

    function advance(): void {
      if (shown >= steps.length) return;
      shown += 1;
      selected = shown;
      if (isFinished()) stopAutoplay();
      render();
    }

    nextButton.addEventListener('click', advance);

    autoButton.addEventListener('click', () => {
      if (autoplayId !== null) {
        stopAutoplay();
        render();
        return;
      }
      advance();
      if (isFinished()) return;
      autoplayId = setInterval(advance, AUTOPLAY_MS);
      render();
    });

    allButton.addEventListener('click', () => {
      stopAutoplay();
      shown = steps.length;
      selected = shown;
      render();
    });

    againButton.addEventListener('click', () => options.onRestart());
    menuButton.addEventListener('click', () => options.onMenu());

    function render(): void {
      roundLabel.textContent = shown === 0 ? '還沒開始' : `第 ${shown} 次`;
      autoButton.textContent = autoplayId === null ? '自動播放' : '暫停播放';

      const finished = isFinished();
      const controlsHadFocus = controls.contains(document.activeElement);
      controls.hidden = finished;
      done.hidden = !finished;
      doneTitle.textContent = `電腦用 ${steps.length} 次猜中！`;
      empty.hidden = shown > 0;

      const rows: HTMLElement[] = [];
      for (let i = shown; i >= 1; i -= 1) rows.push(createRow(steps[i - 1]!, i === selected));
      list.replaceChildren(...rows);

      const step = selected > 0 ? steps[selected - 1] : undefined;
      explain.replaceChildren(
        ...(step
          ? renderStep(step)
          : [el('p', { class: 'solver-empty', text: '電腦會先猜一組，再根據每次的回饋一步步縮小範圍。' })]),
      );

      // 按鈕列收起來時焦點會失去著落，交給「再出一題」
      if (finished && controlsHadFocus) againButton.focus();
    }

    function createRow(step: SolverStep, isSelected: boolean): HTMLElement {
      const { A, B } = step.feedback;
      const classes = ['history-row', 'solver-row'];
      if (A === CODE_LENGTH) classes.push('is-win');
      if (isSelected) classes.push('is-selected');

      const row = el('button', { class: classes.join(' '), type: 'button', 'aria-pressed': isSelected ? 'true' : 'false' }, [
        el('span', { class: 'history-index', text: `#${step.index}` }),
        el('span', { class: 'history-guess', text: step.guess }),
        el('span', { class: 'history-result' }, [
          el('span', { class: 'res-a', text: `${A}A` }),
          el('span', { class: 'res-b', text: `${B}B` }),
        ]),
      ]);
      row.addEventListener('click', () => {
        selected = step.index;
        render();
      });
      return row;
    }

    // 解題要算一小段時間：先把「思考中」畫出來再算，畫面才不會看起來當住。
    // 用計時器而不是 requestAnimationFrame —— 分頁在背景時不會畫面更新，rAF 會一直等下去
    for (const button of [nextButton, autoButton, allButton]) button.disabled = true;
    explain.replaceChildren(el('p', { class: 'solver-empty', text: '電腦思考中…' }));
    roundLabel.textContent = '還沒開始';

    setTimeout(() => {
      if (destroyed) return;
      steps = solveCode(secret);
      for (const button of [nextButton, autoButton, allButton]) button.disabled = false;
      render();
      nextButton.focus();
    }, 50);
  }

  showSetup();

  return {
    el: root,
    destroy(): void {
      destroyed = true;
      stopAutoplay();
      root.remove();
    },
  };
}

// ---------- 推理說明的文字 ----------

function renderStep(step: SolverStep): HTMLElement[] {
  const { A, B } = step.feedback;
  const parts: HTMLElement[] = [
    el('div', { class: 'solver-step-head' }, [
      el('span', { class: 'solver-step-label', text: `第 ${step.index} 次猜` }),
      el('span', { class: 'history-guess', text: step.guess }),
      el('span', { class: 'history-result' }, [
        el('span', { class: 'res-a', text: `${A}A` }),
        el('span', { class: 'res-b', text: `${B}B` }),
      ]),
    ]),
    el('div', { class: 'notes-section-title', text: '這次回饋告訴我們' }),
    list(step.readings.map(describeReading)),
  ];

  if (A !== CODE_LENGTH) {
    parts.push(el('div', { class: 'notes-section-title', text: '因此可以確定' }));
    parts.push(
      step.conclusions.length > 0
        ? list(step.conclusions.map(describeConclusion))
        : el('p', { class: 'solver-none', text: '還沒有能完全確定的新結論，繼續縮小範圍。' }),
    );
  }

  return parts;
}

function list(items: readonly string[]): HTMLElement {
  return el(
    'ul',
    { class: 'solver-list' },
    items.map((text) => el('li', { text })),
  );
}

function joinDigits(digits: readonly string[]): string {
  return digits.join('、');
}

function describeReading(reading: Reading): string {
  switch (reading.kind) {
    case 'solved':
      return '4A0B，猜中了！';
    case 'none-present':
      return `${joinDigits(reading.digits)} 都不在答案裡，答案的 4 個數字都在其餘 6 個數字中。`;
    case 'all-present':
      return `答案就是 ${joinDigits(reading.digits)} 這 4 個數字，只差排列順序。`;
    case 'some-present':
      return `${joinDigits(reading.digits)} 裡恰好有 ${reading.count} 個在答案裡；其餘 6 個數字裡有 ${CODE_LENGTH - reading.count} 個。`;
    case 'none-in-place':
      return reading.count === 1
        ? '在答案裡的那 1 個數字，不在這次猜的位置上。'
        : `在答案裡的這 ${reading.count} 個數字，都不在這次猜的位置上。`;
    case 'some-in-place':
      return reading.misplaced > 0
        ? `其中 ${reading.count} 個位置正確，${reading.misplaced} 個位置不對。`
        : `其中 ${reading.count} 個位置正確。`;
  }
}

function describeConclusion(conclusion: Conclusion): string {
  switch (conclusion.kind) {
    case 'excluded':
      return `數字 ${joinDigits(conclusion.digits)} 確定不在答案裡。`;
    case 'required':
      return `數字 ${joinDigits(conclusion.digits)} 確定在答案裡。`;
    case 'position-confirmed':
      return `第 ${conclusion.position + 1} 格確定是 ${conclusion.digit}。`;
    case 'position-impossible':
      return `第 ${conclusion.position + 1} 格不可能是 ${joinDigits(conclusion.digits)}。`;
    case 'only-one-left':
      return `只剩一種可能：${conclusion.code}。`;
  }
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
