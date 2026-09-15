/**
 * core 的對外出入口。
 *
 * UI 層一律從 'core' 匯入，不要直接深入 core 內部檔案，
 * 也不要匯出任何會洩漏答案的東西。
 */
export type {
  Code,
  CodeIssue,
  DigitMark,
  Feedback,
  GameConfig,
  GameStatus,
  GuessRecord,
  PositionMark,
  RejectReason,
  Rng,
  SubmitResult,
} from './types';
export { DEFAULT_CONFIG, NOTE_DIGITS } from './types';
export type { Codemaker } from './Codemaker';
export { judge } from './judge';
export { allCodes, generateCode, isValidCode, validateCode } from './codeGenerator';
export { GameNotes } from './GameNotes';
export { LocalRandomCodemaker } from './LocalRandomCodemaker';
export { DevilCodemaker } from './DevilCodemaker';
export { GameSession } from './GameSession';
export { chooseGuess, solveCode } from './solver';
export type { Conclusion, Reading, SolverStep } from './solver';
export { decideMatch, verifyFeedbackHistory } from './versus';
export type { FeedbackCheck, MatchReason, MatchResult, MatchSide, VersusPlayer } from './versus';
export type { GameSessionOptions } from './GameSession';
