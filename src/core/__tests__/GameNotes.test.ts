import { describe, it, expect } from 'vitest';
import { GameNotes } from '../GameNotes';
import { NOTE_DIGITS } from '../types';

describe('GameNotes 數字標記', () => {
  it('預設每個數字都是未定', () => {
    const notes = new GameNotes();
    for (const digit of NOTE_DIGITS) {
      expect(notes.getMark(digit)).toBe('unknown');
    }
  });

  it('點擊循環：未定 → 排除 → 必有 → 未定', () => {
    const notes = new GameNotes();
    expect(notes.cycleMark('3')).toBe('excluded');
    expect(notes.cycleMark('3')).toBe('required');
    expect(notes.cycleMark('3')).toBe('unknown');
    expect(notes.cycleMark('3')).toBe('excluded');
  });

  it('循環只影響被點的那個數字', () => {
    const notes = new GameNotes();
    notes.cycleMark('3');
    expect(notes.getMark('3')).toBe('excluded');
    expect(notes.getMark('4')).toBe('unknown');
  });

  it('setMark 可直接指定狀態', () => {
    const notes = new GameNotes();
    notes.setMark('9', 'required');
    expect(notes.getMark('9')).toBe('required');
    notes.setMark('9', 'unknown');
    expect(notes.getMark('9')).toBe('unknown');
  });

  it('excludeAll 一次標記多個數字為排除', () => {
    const notes = new GameNotes();
    notes.excludeAll('1357');

    expect(notes.getMark('1')).toBe('excluded');
    expect(notes.getMark('3')).toBe('excluded');
    expect(notes.getMark('5')).toBe('excluded');
    expect(notes.getMark('7')).toBe('excluded');
    expect(notes.getMark('2')).toBe('unknown');
  });

  it('excludeAll 會覆寫既有的必有標記', () => {
    const notes = new GameNotes();
    notes.setMark('1', 'required');
    notes.excludeAll('1');
    expect(notes.getMark('1')).toBe('excluded');
  });

  it('snapshot 涵蓋全部十個數字', () => {
    const notes = new GameNotes();
    notes.setMark('0', 'required');

    const snap = notes.snapshot();
    expect(snap.size).toBe(10);
    expect(snap.get('0')).toBe('required');
    expect(snap.get('5')).toBe('unknown');
  });
});

describe('GameNotes 自由備註', () => {
  it('預設為空字串，可讀寫', () => {
    const notes = new GameNotes();
    expect(notes.memo).toBe('');
    notes.memo = '2 一定在第三位';
    expect(notes.memo).toBe('2 一定在第三位');
  });
});

describe('GameNotes 重置', () => {
  it('reset 清掉標記與備註', () => {
    const notes = new GameNotes();
    notes.setMark('1', 'excluded');
    notes.setMark('2', 'required');
    notes.memo = '筆記';

    notes.reset();

    expect(notes.getMark('1')).toBe('unknown');
    expect(notes.getMark('2')).toBe('unknown');
    expect(notes.memo).toBe('');
  });

  it('兩份 GameNotes 互不干擾', () => {
    const a = new GameNotes();
    const b = new GameNotes();

    a.setMark('8', 'required');
    a.memo = 'A';

    expect(b.getMark('8')).toBe('unknown');
    expect(b.memo).toBe('');
  });
});
