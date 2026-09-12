import { describe, it, expect } from 'vitest';
import { generateCode, isValidCode, validateCode } from '../codeGenerator';
import { DEFAULT_CONFIG } from '../types';
import { mulberry32, seededRng } from './helpers';

describe('isValidCode', () => {
  it('接受 4 碼不重複的數字，首位為 0 也合法', () => {
    expect(isValidCode('1234')).toBe(true);
    expect(isValidCode('0123')).toBe(true);
    expect(isValidCode('9012')).toBe(true);
    expect(isValidCode('0987')).toBe(true);
  });

  it('拒絕長度不是 4 的輸入', () => {
    expect(isValidCode('')).toBe(false);
    expect(isValidCode('123')).toBe(false);
    expect(isValidCode('12345')).toBe(false);
  });

  it('拒絕有重複數字的輸入', () => {
    expect(isValidCode('1123')).toBe(false);
    expect(isValidCode('0000')).toBe(false);
    expect(isValidCode('1231')).toBe(false);
  });

  it('拒絕含非數字的輸入', () => {
    expect(isValidCode('12a4')).toBe(false);
    expect(isValidCode('12 4')).toBe(false);
    expect(isValidCode('１２３４')).toBe(false); // 全形數字
    expect(isValidCode('-123')).toBe(false);
  });

  it('allowDuplicateDigits 為 true 時允許重複', () => {
    const config = { codeLength: 4, allowDuplicateDigits: true };
    expect(isValidCode('1123', config)).toBe(true);
    expect(isValidCode('0000', config)).toBe(true);
    expect(isValidCode('12a4', config)).toBe(false);
  });
});

describe('validateCode', () => {
  it('合法時回傳 null', () => {
    expect(validateCode('0123')).toBeNull();
    expect(validateCode('9876')).toBeNull();
  });

  it('長度不符回傳 length（含還沒填滿的情況）', () => {
    expect(validateCode('')).toBe('length');
    expect(validateCode('12')).toBe('length');
    expect(validateCode('123')).toBe('length');
    expect(validateCode('12345')).toBe('length');
  });

  it('含非數字回傳 non-digit', () => {
    expect(validateCode('12a4')).toBe('non-digit');
    expect(validateCode('12 4')).toBe('non-digit');
    expect(validateCode('１２３４')).toBe('non-digit');
  });

  it('有重複數字回傳 duplicate-digit', () => {
    expect(validateCode('1123')).toBe('duplicate-digit');
    expect(validateCode('0000')).toBe('duplicate-digit');
  });

  it('allowDuplicateDigits 為 true 時重複是合法的', () => {
    expect(validateCode('1123', { codeLength: 4, allowDuplicateDigits: true })).toBeNull();
  });

  it('與 isValidCode 的結果一致', () => {
    for (const code of ['0123', '', '12', '12a4', '1123', '9876']) {
      expect(isValidCode(code)).toBe(validateCode(code) === null);
    }
  });
});

describe('generateCode', () => {
  it('產生的答案為 4 碼、全為數字、無重複', () => {
    const code = generateCode();
    expect(code).toHaveLength(4);
    expect(/^\d{4}$/.test(code)).toBe(true);
    expect(new Set(code).size).toBe(4);
  });

  it('連續產生 1000 組答案，全部合法', () => {
    for (let i = 0; i < 1000; i += 1) {
      const code = generateCode();
      expect(isValidCode(code, DEFAULT_CONFIG)).toBe(true);
    }
  });

  it('1000 組中會出現首位為 0 的答案（0 開頭沒有被排除）', () => {
    const rng = mulberry32(20260912);
    let leadingZero = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (generateCode(DEFAULT_CONFIG, rng).startsWith('0')) leadingZero += 1;
    }
    expect(leadingZero).toBeGreaterThan(0);
  });

  it('1000 組中會出現多種不同答案（不是每次都回傳同一組）', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) seen.add(generateCode());
    expect(seen.size).toBeGreaterThan(100);
  });

  it('注入固定 rng 時輸出可預期（決定論）', () => {
    // rng 永遠回傳 0 → Fisher-Yates 每次都選當前位置，等同不洗牌
    expect(generateCode(DEFAULT_CONFIG, seededRng([0]))).toBe('0123');

    // rng 永遠回傳接近 1 → 每次都選剩餘範圍的最後一個
    expect(generateCode(DEFAULT_CONFIG, seededRng([0.999999]))).toBe('9012');

    // 同一組 seed 產生的序列必定相同
    const a = Array.from({ length: 20 }, () => 0);
    const rngA = mulberry32(42);
    const rngB = mulberry32(42);
    for (let i = 0; i < a.length; i += 1) {
      expect(generateCode(DEFAULT_CONFIG, rngA)).toBe(generateCode(DEFAULT_CONFIG, rngB));
    }
  });

  it('rng 回傳邊界值 1 時仍產生合法答案（不會越界）', () => {
    const code = generateCode(DEFAULT_CONFIG, () => 1);
    expect(isValidCode(code)).toBe(true);
  });

  it('支援其他長度', () => {
    const config = { codeLength: 6, allowDuplicateDigits: false };
    const code = generateCode(config);
    expect(code).toHaveLength(6);
    expect(new Set(code).size).toBe(6);
  });

  it('不允許重複時長度超過 10 會拋出錯誤', () => {
    expect(() => generateCode({ codeLength: 11, allowDuplicateDigits: false })).toThrow();
  });

  it('allowDuplicateDigits 為 true 時可產生超過 10 碼', () => {
    const code = generateCode({ codeLength: 12, allowDuplicateDigits: true });
    expect(code).toHaveLength(12);
    expect(/^\d{12}$/.test(code)).toBe(true);
  });
});
