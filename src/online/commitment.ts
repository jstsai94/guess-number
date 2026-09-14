/**
 * 密碼承諾（commit–reveal）。
 *
 * 對戰開始前只公開 SHA-256(密碼:鹽)，結束後才公開密碼與鹽，讓對手核對。
 * 鹽是 32 位元組的隨機數，避免對手把 5040 組密碼全部算一遍來反查。
 *
 * 使用瀏覽器（與 Node）內建的 Web Crypto，不需要額外套件。
 */

const SALT_BYTES = 32;

/** 產生一組隨機鹽，回傳 64 位十六進位字串。 */
export function createSalt(): string {
  const bytes = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** 計算承諾雜湊，回傳 64 位十六進位字串。 */
export async function commitHash(code: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${code}:${salt}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

/** 核對公開的密碼與鹽是否與先前的雜湊相符。 */
export async function verifyCommit(code: string, salt: string, hash: string): Promise<boolean> {
  return (await commitHash(code, salt)) === hash;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
