import './versus.css';
import { getFirebase } from '../../online/firebase';
import { openMatch, type MatchView, type VersusMatch } from '../../online/match';
import { RoomError, cancelRoom, createRoom, joinRoom } from '../../online/room';
import { el } from '../dom';
import { createJoinView } from './JoinView';
import { createWaitView } from './WaitView';

/**
 * 連線對戰的入口。整個資料夾（含 Firebase）以 import() 按需載入，
 * 只玩猜電腦的人不會下載它。
 *
 * 目前完成：建立房間 → 等待對手；加入房間。
 * 設定密碼、對戰中、結算畫面在接下來的階段補上。
 */

export interface VersusScreenOptions {
  readonly mode: 'host' | 'join';
  readonly onExit: () => void;
}

export interface VersusScreenHandle {
  readonly el: HTMLElement;
  destroy(): void;
}

interface Disposable {
  destroy(): void;
}

export function createVersusScreen(options: VersusScreenOptions): VersusScreenHandle {
  const body = el('div', { class: 'versus-body' });
  const root = el('div', { class: 'app versus' }, [
    el('header', { class: 'header' }, [el('h1', { class: 'title', text: '1A2B 猜數字' })]),
    el('div', { class: 'divider' }),
    body,
  ]);

  let destroyed = false;
  let match: VersusMatch | null = null;
  let currentPart: Disposable | null = null;
  let renderedPhase: MatchView['phase'] | null = null;

  function setBody(node: HTMLElement, part: Disposable | null = null): void {
    currentPart?.destroy();
    currentPart = part;
    body.replaceChildren(node);
  }

  function showLoading(text: string): void {
    setBody(el('section', { class: 'panel versus-card' }, [el('p', { class: 'versus-loading', text })]));
  }

  function showMessage(title: string, message: string): void {
    const back = el('button', { class: 'btn-primary', type: 'button', text: '回到選單' });
    back.addEventListener('click', () => options.onExit());
    setBody(
      el('section', { class: 'panel versus-card' }, [
        el('h2', { class: 'versus-title', text: title }),
        el('p', { class: 'versus-message', text: message }),
        el('div', { class: 'versus-actions' }, [back]),
      ]),
    );
    queueMicrotask(() => back.focus());
  }

  // ---------- 對戰狀態 → 畫面 ----------

  function render(view: MatchView): void {
    if (destroyed || view.phase === renderedPhase) return;

    switch (view.phase) {
      case 'waiting':
        // 房主的等待畫面在建立房間時已經顯示，這裡不重畫
        break;
      case 'cancelled':
        showMessage('房間已關閉', '房主已經取消這個房間。');
        break;
      case 'setting':
      case 'playing':
      case 'finished':
        showMessage('對手已加入', '設定密碼與對戰畫面還在製作中。');
        break;
    }
    renderedPhase = view.phase;
  }

  async function enterRoom(roomCode: string): Promise<void> {
    const opened = await openMatch(roomCode);
    if (destroyed) {
      opened.close();
      return;
    }
    match = opened;
    match.onError((error) => console.warn('對戰連線發生錯誤', error));
    match.onUpdate(render);
  }

  // ---------- 建立房間 ----------

  async function host(): Promise<void> {
    showLoading('建立房間中…');
    try {
      const { db, uid } = await getFirebase();
      const roomCode = await createRoom(db, uid);
      if (destroyed) return;

      const wait = createWaitView({
        roomCode,
        onCancel: () => {
          void cancelRoom(db, roomCode).catch(() => undefined);
          options.onExit();
        },
      });
      setBody(wait.el, wait);
      renderedPhase = 'waiting';
      await enterRoom(roomCode);
    } catch (error) {
      if (!destroyed) showMessage('無法建立房間', describeConnectionError(error));
    }
  }

  // ---------- 加入房間 ----------

  function join(): void {
    const view = createJoinView({
      onBack: () => options.onExit(),
      onJoin: (roomCode) => {
        void (async () => {
          view.setBusy(true);
          try {
            const { db, uid } = await getFirebase();
            await joinRoom(db, uid, roomCode);
            if (destroyed) return;
            showLoading('加入房間中…');
            await enterRoom(roomCode);
          } catch (error) {
            if (destroyed) return;
            view.setBusy(false);
            view.showError(describeJoinError(error));
          }
        })();
      },
    });
    setBody(view.el, view);
  }

  if (options.mode === 'host') void host();
  else join();

  return {
    el: root,
    destroy(): void {
      destroyed = true;
      currentPart?.destroy();
      match?.close();
      root.remove();
    },
  };
}

function describeJoinError(error: unknown): string {
  if (error instanceof RoomError) {
    switch (error.code) {
      case 'not-found':
        return '找不到這個房號';
      case 'full':
        return '這個房間已經滿了';
      case 'expired':
        return '這個房間已經過期';
      case 'own-room':
        return '這是你自己建立的房間';
      case 'no-code-available':
        return '無法連線到對戰伺服器，請稍後再試';
    }
  }
  return describeConnectionError(error);
}

/** 把 Firebase 的錯誤代碼翻成玩家看得懂的話。 */
function describeConnectionError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    return '對戰伺服器還沒有開放登入，請稍後再試。';
  }
  if (code === 'auth/network-request-failed' || code === 'unavailable') {
    return '網路連線失敗，請確認網路後再試一次。';
  }
  if (code === 'permission-denied') {
    // 規則擋下通常代表伺服器端設定尚未完成（例如安全規則還沒部署），而不是玩家做錯了什麼
    return '對戰伺服器還沒有設定完成，請稍後再試。';
  }
  return '無法連線到對戰伺服器，請稍後再試。';
}
