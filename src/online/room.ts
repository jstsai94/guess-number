import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Feedback } from '../core';

/**
 * 連線對戰房間的 Firestore 操作。資料結構見 SPEC.md 第 8 節，權限見 firestore.rules。
 *
 * 這裡只負責「讀寫資料」，不做勝負判斷（那在 core/versus.ts 與 online/match.ts）。
 */

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export type RoomMode = 'mutual';

export interface RoomDoc {
  readonly mode: RoomMode;
  readonly hostUid: string;
  readonly guestUid: string | null;
  readonly createdAt: Timestamp | null;
  readonly expiresAt: Timestamp;
}

export interface PlayerDoc {
  readonly commitHash: string | null;
  readonly committedAt: Timestamp | null;
  readonly lastSeen: Timestamp | null;
  readonly surrendered: boolean;
  readonly expiresAt: Timestamp;
}

export interface GuessDoc {
  readonly from: string;
  readonly to: string;
  readonly index: number;
  readonly guess: string;
  readonly createdAt: Timestamp | null;
  readonly feedback: Feedback | null;
  readonly judgedAt: Timestamp | null;
  readonly expiresAt: Timestamp;
}

export interface RevealDoc {
  readonly code: string;
  readonly salt: string;
  readonly createdAt: Timestamp | null;
  readonly expiresAt: Timestamp;
}

export type ClaimType = 'disconnect' | 'judge-timeout' | 'no-reveal';

export interface ClaimDoc {
  readonly type: ClaimType;
  readonly claimant: string;
  readonly against: string;
  readonly guessId: string | null;
  readonly createdAt: Timestamp | null;
  readonly expiresAt: Timestamp;
}

/** 房間的完整即時狀態，由五個監聽合併而成。 */
export interface RoomState {
  readonly roomCode: string;
  /** 房間被刪除（例如房主取消）時為 null。 */
  readonly room: RoomDoc | null;
  readonly players: ReadonlyMap<string, PlayerDoc>;
  readonly guesses: ReadonlyArray<GuessDoc & { readonly id: string }>;
  readonly reveals: ReadonlyMap<string, RevealDoc>;
  /** 以文件 ID（類型_被申訴者）為鍵。 */
  readonly claims: ReadonlyMap<string, ClaimDoc>;
}

export type RoomErrorCode = 'not-found' | 'full' | 'expired' | 'own-room' | 'no-code-available';

export class RoomError extends Error {
  readonly code: RoomErrorCode;

  constructor(code: RoomErrorCode) {
    super(`RoomError: ${code}`);
    this.name = 'RoomError';
    this.code = code;
  }
}

// ---------- 路徑 ----------

const roomRef = (db: Firestore, roomCode: string) => doc(db, 'rooms', roomCode);
const playerRef = (db: Firestore, roomCode: string, uid: string) => doc(db, 'rooms', roomCode, 'players', uid);
const guessRef = (db: Firestore, roomCode: string, id: string) => doc(db, 'rooms', roomCode, 'guesses', id);
const revealRef = (db: Firestore, roomCode: string, uid: string) => doc(db, 'rooms', roomCode, 'reveals', uid);
const claimRef = (db: Firestore, roomCode: string, id: string) => doc(db, 'rooms', roomCode, 'claims', id);

/** 猜測文件的 ID 固定為「猜的人_猜測」，資料庫層級就不可能重複猜同一組。 */
export const guessIdOf = (uid: string, guess: string): string => `${uid}_${guess}`;

/** 申訴文件的 ID 固定為「類型_被申訴者」，同一種申訴對同一人只會有一筆。 */
export const claimIdOf = (type: ClaimType, against: string): string => `${type}_${against}`;

// 伺服器時間在本機寫入尚未確認前以估計值呈現，避免畫面拿到 null
const readData = <T>(snap: DocumentSnapshot | QueryDocumentSnapshot): T =>
  snap.data({ serverTimestamps: 'estimate' }) as T;

function randomRoomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(n).padStart(6, '0');
}

// ---------- 建房與加入 ----------

/** 建立房間並回傳房號；房號已被使用就重抽。 */
export async function createRoom(db: Firestore, uid: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const roomCode = randomRoomCode();
    const created = await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef(db, roomCode));
      if (snap.exists()) return false;
      tx.set(roomRef(db, roomCode), {
        mode: 'mutual',
        hostUid: uid,
        guestUid: null,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + ROOM_TTL_MS),
      });
      return true;
    });

    if (created) {
      // 必須在房間建立「之後」才能寫玩家文件：安全規則的 get() 看不到同一筆交易中尚未寫入的房間
      await ensurePlayer(db, roomCode, uid);
      return roomCode;
    }
  }
  throw new RoomError('no-code-available');
}

/** 以房號加入；重新整理後回到自己已加入的房間也走這裡。 */
export async function joinRoom(db: Firestore, uid: string, roomCode: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(db, roomCode));
    if (!snap.exists()) throw new RoomError('not-found');

    const room = snap.data() as RoomDoc;
    if (room.hostUid === uid) throw new RoomError('own-room');
    if (room.guestUid === uid) return; // 已經加入過
    if (room.guestUid !== null) throw new RoomError('full');
    if (room.expiresAt.toMillis() <= Date.now()) throw new RoomError('expired');

    tx.update(roomRef(db, roomCode), { guestUid: uid });
  });

  await ensurePlayer(db, roomCode, uid);
}

/** 確保自己的玩家文件存在；已存在就不動（避免覆寫已設定的雜湊）。 */
export async function ensurePlayer(db: Firestore, roomCode: string, uid: string): Promise<void> {
  const ref = playerRef(db, roomCode, uid);
  if ((await getDoc(ref)).exists()) return;

  const roomSnap = await getDoc(roomRef(db, roomCode));
  if (!roomSnap.exists()) throw new RoomError('not-found');
  const { expiresAt } = roomSnap.data() as RoomDoc;

  await setDoc(ref, {
    commitHash: null,
    committedAt: null,
    lastSeen: serverTimestamp(),
    surrendered: false,
    expiresAt,
  });
}

/** 房主在對手加入前取消房間。 */
export async function cancelRoom(db: Firestore, roomCode: string): Promise<void> {
  await deleteDoc(roomRef(db, roomCode));
}

// ---------- 對戰中的寫入 ----------

/** 寫入密碼雜湊；只能寫一次。 */
export async function commitSecret(db: Firestore, roomCode: string, uid: string, hash: string): Promise<void> {
  await updateDoc(playerRef(db, roomCode, uid), {
    commitHash: hash,
    committedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
  });
}

/** 心跳：更新最後在線時間。 */
export async function touch(db: Firestore, roomCode: string, uid: string): Promise<void> {
  await updateDoc(playerRef(db, roomCode, uid), { lastSeen: serverTimestamp() });
}

export async function markSurrendered(db: Firestore, roomCode: string, uid: string): Promise<void> {
  await updateDoc(playerRef(db, roomCode, uid), { surrendered: true, lastSeen: serverTimestamp() });
}

export interface NewGuess {
  readonly from: string;
  readonly to: string;
  readonly index: number;
  readonly guess: string;
  readonly expiresAt: Timestamp;
}

/** 送出一次猜測，回傳文件 ID。 */
export async function sendGuess(db: Firestore, roomCode: string, g: NewGuess): Promise<string> {
  const id = guessIdOf(g.from, g.guess);
  await setDoc(guessRef(db, roomCode, id), {
    from: g.from,
    to: g.to,
    index: g.index,
    guess: g.guess,
    createdAt: serverTimestamp(),
    feedback: null,
    judgedAt: null,
    expiresAt: g.expiresAt,
  });
  return id;
}

/** 密碼持有者寫回判定結果；只能寫一次。 */
export async function writeFeedback(db: Firestore, roomCode: string, guessId: string, feedback: Feedback): Promise<void> {
  await updateDoc(guessRef(db, roomCode, guessId), {
    feedback: { A: feedback.A, B: feedback.B },
    judgedAt: serverTimestamp(),
  });
}

/** 公開自己的密碼與鹽，讓對手核對；寫入後不可修改。 */
export async function publishReveal(
  db: Firestore,
  roomCode: string,
  uid: string,
  reveal: { readonly code: string; readonly salt: string; readonly expiresAt: Timestamp },
): Promise<void> {
  await setDoc(revealRef(db, roomCode, uid), {
    code: reveal.code,
    salt: reveal.salt,
    // 公開時間：對手若 60 秒內沒有公開，可以據此提出「未公開密碼」申訴
    createdAt: serverTimestamp(),
    expiresAt: reveal.expiresAt,
  });
}

export interface NewClaim {
  readonly type: ClaimType;
  readonly claimant: string;
  readonly against: string;
  readonly guessId: string | null;
  readonly expiresAt: Timestamp;
}

/**
 * 提出申訴。時間條件由安全規則以伺服器時間驗證；
 * 條件還沒成立時寫入會被拒絕，呼叫端稍後再試即可。
 */
export async function writeClaim(db: Firestore, roomCode: string, claim: NewClaim): Promise<void> {
  await setDoc(claimRef(db, roomCode, claimIdOf(claim.type, claim.against)), {
    type: claim.type,
    claimant: claim.claimant,
    against: claim.against,
    guessId: claim.guessId,
    createdAt: serverTimestamp(),
    expiresAt: claim.expiresAt,
  });
}

// ---------- 監聽 ----------

/**
 * 監聽房間的完整狀態。五個監聽都收到第一次資料後才開始回呼，避免畫面閃爍。
 * 回傳的函式用來停止監聽。
 */
export function watchRoom(
  db: Firestore,
  roomCode: string,
  onChange: (state: RoomState) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let room: RoomDoc | null | undefined;
  let players: Map<string, PlayerDoc> | undefined;
  let guesses: Array<GuessDoc & { id: string }> | undefined;
  let reveals: Map<string, RevealDoc> | undefined;
  let claims: Map<string, ClaimDoc> | undefined;

  const emit = (): void => {
    if (room === undefined || !players || !guesses || !reveals || !claims) return;
    onChange({ roomCode, room, players, guesses, reveals, claims });
  };

  const sub = (name: string) => collection(db, 'rooms', roomCode, name);

  const unsubscribes = [
    onSnapshot(
      roomRef(db, roomCode),
      (snap) => {
        room = snap.exists() ? readData<RoomDoc>(snap) : null;
        emit();
      },
      onError,
    ),
    onSnapshot(
      sub('players'),
      (snap) => {
        players = new Map(snap.docs.map((d) => [d.id, readData<PlayerDoc>(d)]));
        emit();
      },
      onError,
    ),
    onSnapshot(
      sub('guesses'),
      (snap) => {
        guesses = snap.docs.map((d) => ({ id: d.id, ...readData<GuessDoc>(d) }));
        emit();
      },
      onError,
    ),
    onSnapshot(
      sub('reveals'),
      (snap) => {
        reveals = new Map(snap.docs.map((d) => [d.id, readData<RevealDoc>(d)]));
        emit();
      },
      onError,
    ),
    onSnapshot(
      sub('claims'),
      (snap) => {
        claims = new Map(snap.docs.map((d) => [d.id, readData<ClaimDoc>(d)]));
        emit();
      },
      onError,
    ),
  ];

  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
