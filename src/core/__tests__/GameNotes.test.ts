import { describe, it, expect } from 'vitest';
import { GameNotes } from '../GameNotes';
import { NOTE_DIGITS } from '../types';

describe('GameNotes 數字狀態列', () => {
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

describe('GameNotes 位置推理表', () => {
  it('預設每一格都是可能', () => {
    const notes = new GameNotes();
    for (const digit of NOTE_DIGITS) {
      for (let position = 0; position < 4; position += 1) {
        expect(notes.getPositionMark(digit, position)).toBe('possible');
      }
    }
  });

  it('點擊循環：可能 → 不可能 → 確定 → 可能', () => {
    const notes = new GameNotes();
    expect(notes.cyclePositionMark('7', 2)).toBe('impossible');
    expect(notes.cyclePositionMark('7', 2)).toBe('confirmed');
    expect(notes.cyclePositionMark('7', 2)).toBe('possible');
    expect(notes.cyclePositionMark('7', 2)).toBe('impossible');
  });

  it('每一格互相獨立：同數字不同位、同位不同數字都不受影響', () => {
    const notes = new GameNotes();
    notes.setPositionMark('7', 2, 'confirmed');

    expect(notes.getPositionMark('7', 2)).toBe('confirmed');
    expect(notes.getPositionMark('7', 0)).toBe('possible');
    expect(notes.getPositionMark('7', 1)).toBe('possible');
    expect(notes.getPositionMark('7', 3)).toBe('possible');
    expect(notes.getPositionMark('8', 2)).toBe('possible');
  });

  it('setPositionMark 可直接指定狀態', () => {
    const notes = new GameNotes();
    notes.setPositionMark('0', 0, 'impossible');
    expect(notes.getPositionMark('0', 0)).toBe('impossible');
    notes.setPositionMark('0', 0, 'possible');
    expect(notes.getPositionMark('0', 0)).toBe('possible');
  });

});

describe('GameNotes 數字排除連動位置推理表', () => {
  it('數字被排除時，四個位置一律為不可能', () => {
    const notes = new GameNotes();
    notes.setMark('5', 'excluded');

    expect(notes.isPositionLocked('5')).toBe(true);
    for (let position = 0; position < 4; position += 1) {
      expect(notes.getPositionMark('5', position)).toBe('impossible');
    }
    expect(notes.isPositionLocked('6')).toBe(false);
    expect(notes.getPositionMark('6', 0)).toBe('possible');
  });

  it('排除中的數字，點擊位置不會改變標記', () => {
    const notes = new GameNotes();
    notes.setMark('5', 'excluded');
    expect(notes.cyclePositionMark('5', 0)).toBe('impossible');
    expect(notes.cyclePositionMark('5', 0)).toBe('impossible');

    notes.setMark('5', 'unknown');
    expect(notes.getPositionMark('5', 0)).toBe('possible');
  });

  it('取消排除後恢復原本自己標的位置標記', () => {
    const notes = new GameNotes();
    notes.setPositionMark('5', 2, 'confirmed');
    notes.setPositionMark('5', 3, 'impossible');

    notes.cycleMark('5'); // 未定 → 排除
    expect(notes.getPositionMark('5', 2)).toBe('impossible');
    expect(notes.getPositionMark('5', 0)).toBe('impossible');

    notes.cycleMark('5'); // 排除 → 必有
    expect(notes.getPositionMark('5', 2)).toBe('confirmed');
    expect(notes.getPositionMark('5', 3)).toBe('impossible');
    expect(notes.getPositionMark('5', 0)).toBe('possible');
  });

  it('0A0B 的 excludeAll 也會連動位置推理表', () => {
    const notes = new GameNotes();
    notes.excludeAll('1357');
    expect(notes.getPositionMark('1', 0)).toBe('impossible');
    expect(notes.getPositionMark('7', 3)).toBe('impossible');
    expect(notes.getPositionMark('2', 0)).toBe('possible');
  });

  it('位置推理表不會反過來改動數字狀態列', () => {
    const notes = new GameNotes();
    notes.setPositionMark('6', 1, 'confirmed');
    expect(notes.getMark('6')).toBe('unknown');

    for (let position = 0; position < 4; position += 1) notes.setPositionMark('8', position, 'impossible');
    expect(notes.getMark('8')).toBe('unknown');
  });
});

describe('GameNotes 重置', () => {
  it('reset 同時清掉兩套標記', () => {
    const notes = new GameNotes();
    notes.setMark('1', 'excluded');
    notes.setMark('2', 'required');
    notes.setPositionMark('3', 0, 'confirmed');
    notes.setPositionMark('4', 3, 'impossible');

    notes.reset();

    expect(notes.getMark('1')).toBe('unknown');
    expect(notes.getMark('2')).toBe('unknown');
    expect(notes.getPositionMark('1', 0)).toBe('possible');
    expect(notes.getPositionMark('3', 0)).toBe('possible');
    expect(notes.getPositionMark('4', 3)).toBe('possible');
  });

  it('兩份 GameNotes 互不干擾', () => {
    const a = new GameNotes();
    const b = new GameNotes();

    a.setMark('8', 'required');
    a.setPositionMark('8', 1, 'confirmed');

    expect(b.getMark('8')).toBe('unknown');
    expect(b.getPositionMark('8', 1)).toBe('possible');
  });
});
