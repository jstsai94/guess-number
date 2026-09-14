import { describe, it, expect } from 'vitest';
import { commitHash, createSalt, verifyCommit } from '../commitment';

const HEX64 = /^[0-9a-f]{64}$/;

describe('commitment', () => {
  it('鹽是 64 位十六進位字串，每次都不同', () => {
    const salts = new Set(Array.from({ length: 50 }, () => createSalt()));
    expect(salts.size).toBe(50);
    for (const salt of salts) expect(salt).toMatch(HEX64);
  });

  it('雜湊是 64 位十六進位字串，相同輸入結果相同', async () => {
    const salt = createSalt();
    const first = await commitHash('4721', salt);
    expect(first).toMatch(HEX64);
    expect(await commitHash('4721', salt)).toBe(first);
  });

  it('同一組密碼搭配不同的鹽，雜湊不同', async () => {
    expect(await commitHash('4721', createSalt())).not.toBe(await commitHash('4721', createSalt()));
  });

  it('不同密碼搭配同一個鹽，雜湊不同', async () => {
    const salt = createSalt();
    expect(await commitHash('4721', salt)).not.toBe(await commitHash('4712', salt));
  });

  it('核對：正確的密碼與鹽通過；改動密碼或鹽都失敗', async () => {
    const salt = createSalt();
    const hash = await commitHash('4721', salt);

    expect(await verifyCommit('4721', salt, hash)).toBe(true);
    expect(await verifyCommit('4712', salt, hash)).toBe(false);
    expect(await verifyCommit('4721', createSalt(), hash)).toBe(false);
  });

  it('分隔符號避免拼接歧義：密碼與鹽的邊界不同，雜湊就不同', async () => {
    // 若直接相接，"0123" + "4abc…" 與 "01234" + "abc…" 會是同一個字串
    expect(await commitHash('0123', '4abc')).not.toBe(await commitHash('01234', 'abc'));
  });
});
