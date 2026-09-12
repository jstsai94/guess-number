import type { Code, CodeIssue, GameConfig, Rng } from './types';
import { DEFAULT_CONFIG } from './types';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/**
 * 檢查一組字串為何不合法，合法時回傳 null。
 *
 * 合法條件：長度相符、全部為 0-9 的數字、依設定判斷是否允許重複。
 * 首位為 0 是合法的（例如 "0123"）。
 *
 * 回傳的是原因代碼，不是使用者訊息 —— 中文文案一律由 UI 層負責。
 */
export function validateCode(code: string, config: GameConfig = DEFAULT_CONFIG): CodeIssue | null {
  if (typeof code !== 'string' || code.length !== config.codeLength) return 'length';

  for (const ch of code) {
    if (ch < '0' || ch > '9') return 'non-digit';
  }

  if (!config.allowDuplicateDigits && new Set(code).size !== code.length) {
    return 'duplicate-digit';
  }

  return null;
}

/** `validateCode` 的布林版本。 */
export function isValidCode(code: string, config: GameConfig = DEFAULT_CONFIG): boolean {
  return validateCode(code, config) === null;
}

/**
 * 隨機產生一組合法密碼。
 *
 * rng 可注入，預設使用 Math.random；測試時傳入決定性的 rng 即可得到可預期的輸出。
 */
export function generateCode(config: GameConfig = DEFAULT_CONFIG, rng: Rng = Math.random): Code {
  const { codeLength, allowDuplicateDigits } = config;

  if (codeLength < 0) {
    throw new Error(`generateCode: codeLength 不可為負數（收到 ${codeLength}）`);
  }
  if (!allowDuplicateDigits && codeLength > DIGITS.length) {
    throw new Error(
      `generateCode: 不允許重複時 codeLength 最多為 ${DIGITS.length}（收到 ${codeLength}）`,
    );
  }

  if (allowDuplicateDigits) {
    let out = '';
    for (let i = 0; i < codeLength; i += 1) {
      out += DIGITS[pickIndex(rng, DIGITS.length)];
    }
    return out;
  }

  // Fisher-Yates 部分洗牌：只洗出前 codeLength 個位置
  const pool = [...DIGITS];
  for (let i = 0; i < codeLength; i += 1) {
    const j = i + pickIndex(rng, pool.length - i);
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, codeLength).join('');
}

/** 將 rng 的 [0,1) 轉成 [0, size) 的整數，並夾住邊界以防 rng 回傳 1。 */
function pickIndex(rng: Rng, size: number): number {
  const raw = Math.floor(rng() * size);
  if (raw < 0) return 0;
  if (raw >= size) return size - 1;
  return raw;
}
