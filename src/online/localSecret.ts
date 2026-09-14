import { isValidCode } from '../core';

/**
 * 對戰中自己的密碼與鹽。
 *
 * 只存在這個分頁的 sessionStorage：重新整理頁面可以接續對戰，關閉分頁就清除。
 * 資料庫永遠只有雜湊，明文密碼只存在這裡與記憶體中。
 */
export interface LocalSecret {
  readonly code: string;
  readonly salt: string;
}

const storageKey = (roomCode: string): string => `guess-number:secret:${roomCode}`;

export function saveSecret(roomCode: string, secret: LocalSecret): void {
  try {
    sessionStorage.setItem(storageKey(roomCode), JSON.stringify(secret));
  } catch {
    // 無法寫入（例如封鎖網站資料）時只是無法在重新整理後接續，不影響本次對戰
  }
}

export function loadSecret(roomCode: string): LocalSecret | null {
  try {
    const raw = sessionStorage.getItem(storageKey(roomCode));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { code, salt } = parsed as Record<string, unknown>;
    if (typeof code !== 'string' || !isValidCode(code)) return null;
    if (typeof salt !== 'string' || !/^[0-9a-f]{64}$/.test(salt)) return null;
    return { code, salt };
  } catch {
    return null;
  }
}

export function clearSecret(roomCode: string): void {
  try {
    sessionStorage.removeItem(storageKey(roomCode));
  } catch {
    // 忽略
  }
}
