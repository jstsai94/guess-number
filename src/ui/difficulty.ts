import type { Codemaker } from '../core';
import { DevilCodemaker, LocalRandomCodemaker } from '../core';

/**
 * 猜電腦模式的難度。
 *
 * 這是介面層的概念：core 只知道 Codemaker，不知道「難度」這回事。
 */
export type Difficulty = 'normal' | 'devil';

export const DIFFICULTIES: readonly Difficulty[] = ['normal', 'devil'];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  normal: '一般',
  devil: '惡魔',
};

/**
 * 依難度建立出題者。
 *
 * 建立後直接交給 GameSession，介面層不保留 Codemaker 的參考 ——
 * 這樣 UI 永遠只能透過 GameSession 互動，拿不到答案。
 */
export function createCodemaker(difficulty: Difficulty): Codemaker {
  return difficulty === 'devil' ? new DevilCodemaker() : new LocalRandomCodemaker();
}
