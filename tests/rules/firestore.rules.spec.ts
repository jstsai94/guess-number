import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * Firestore 安全規則測試（SPEC.md 第 6 節「第二期 D」）。
 * 在 CI 中以 `firebase emulators:exec --only firestore` 啟動模擬器後執行。
 */

const HOST = 'host-uid';
const GUEST = 'guest-uid';
const STRANGER = 'stranger-uid';
const ROOM = '123456';
const HASH = 'a'.repeat(64);
const SALT = 'b'.repeat(64);
const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-guess-number',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

/** 以「關閉規則」的權限準備好房間資料。 */
async function seedRoom(
  opts: { guest?: boolean; hostCommitted?: boolean; guestCommitted?: boolean; guestLastSeenAgoMs?: number } = {},
) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    const player = (committed: boolean | undefined, lastSeenAgoMs = 0) => ({
      commitHash: committed ? HASH : null,
      committedAt: committed ? Timestamp.now() : null,
      lastSeen: Timestamp.fromMillis(Date.now() - lastSeenAgoMs),
      surrendered: false,
      expiresAt,
    });
    await setDoc(doc(f, 'rooms', ROOM), {
      mode: 'mutual',
      hostUid: HOST,
      guestUid: opts.guest ? GUEST : null,
      createdAt: Timestamp.now(),
      expiresAt,
    });
    await setDoc(doc(f, 'rooms', ROOM, 'players', HOST), player(opts.hostCommitted));
    if (opts.guest) {
      await setDoc(doc(f, 'rooms', ROOM, 'players', GUEST), player(opts.guestCommitted, opts.guestLastSeenAgoMs));
    }
  });
}

const newGuess = (from: string, to: string, guess: string) => ({
  from,
  to,
  index: 1,
  guess,
  createdAt: serverTimestamp(),
  feedback: null,
  judgedAt: null,
  expiresAt,
});

async function seedGuess(
  from: string,
  to: string,
  guess: string,
  createdAgoMs = 0,
  feedback: { A: number; B: number } | null = null,
) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'rooms', ROOM, 'guesses', `${from}_${guess}`), {
      ...newGuess(from, to, guess),
      createdAt: Timestamp.fromMillis(Date.now() - createdAgoMs),
      feedback,
    });
  });
}

describe('房間', () => {
  it('未登入讀不到房間；登入者可以讀單一房間，但不能列出所有房間', async () => {
    await seedRoom();
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'rooms', ROOM)));
    await assertSucceeds(getDoc(doc(as(STRANGER), 'rooms', ROOM)));
    await assertFails(getDocs(collection(as(STRANGER), 'rooms')));
  });

  it('建立房間：房號必須 6 位數字、房主必須是自己、對手必須為空', async () => {
    const room = (hostUid: string) => ({
      mode: 'mutual',
      hostUid,
      guestUid: null,
      createdAt: serverTimestamp(),
      expiresAt,
    });
    await assertSucceeds(setDoc(doc(as(HOST), 'rooms', '654321'), room(HOST)));
    await assertFails(setDoc(doc(as(HOST), 'rooms', '12345'), room(HOST)));
    await assertFails(setDoc(doc(as(HOST), 'rooms', 'abcdef'), room(HOST)));
    await assertFails(setDoc(doc(as(HOST), 'rooms', '111111'), room(GUEST)));
    await assertFails(setDoc(doc(as(HOST), 'rooms', '222222'), { ...room(HOST), guestUid: GUEST }));
  });

  it('建立房間：過期時間必須約為 24 小時後', async () => {
    const room = (ms: number) => ({
      mode: 'mutual',
      hostUid: HOST,
      guestUid: null,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + ms),
    });
    await assertFails(setDoc(doc(as(HOST), 'rooms', '333333'), room(365 * 24 * 60 * 60 * 1000)));
    await assertFails(setDoc(doc(as(HOST), 'rooms', '444444'), room(60 * 1000)));
  });

  it('加入：可以把自己寫成對手；已滿、加入自己的房間、偷改其他欄位都不行', async () => {
    await seedRoom();
    await assertFails(updateDoc(doc(as(HOST), 'rooms', ROOM), { guestUid: HOST }));
    await assertFails(updateDoc(doc(as(GUEST), 'rooms', ROOM), { guestUid: STRANGER }));
    await assertFails(updateDoc(doc(as(GUEST), 'rooms', ROOM), { guestUid: GUEST, hostUid: GUEST }));
    await assertSucceeds(updateDoc(doc(as(GUEST), 'rooms', ROOM), { guestUid: GUEST }));
    await assertFails(updateDoc(doc(as(STRANGER), 'rooms', ROOM), { guestUid: STRANGER }));
  });

  it('取消：房主只能在沒人加入前刪除房間', async () => {
    await seedRoom();
    await assertFails(deleteDoc(doc(as(STRANGER), 'rooms', ROOM)));
    await assertSucceeds(deleteDoc(doc(as(HOST), 'rooms', ROOM)));

    await seedRoom({ guest: true });
    await assertFails(deleteDoc(doc(as(HOST), 'rooms', ROOM)));
  });
});

describe('玩家', () => {
  it('非房間成員讀不到玩家資料', async () => {
    await seedRoom({ guest: true });
    await assertSucceeds(getDoc(doc(as(GUEST), 'rooms', ROOM, 'players', HOST)));
    await assertFails(getDoc(doc(as(STRANGER), 'rooms', ROOM, 'players', HOST)));
  });

  it('雜湊只能設定一次，而且必須是 64 位十六進位', async () => {
    await seedRoom({ guest: true });
    const me = doc(as(GUEST), 'rooms', ROOM, 'players', GUEST);

    await assertFails(updateDoc(me, { commitHash: 'not-a-hash', committedAt: serverTimestamp(), lastSeen: serverTimestamp() }));
    await assertSucceeds(updateDoc(me, { commitHash: HASH, committedAt: serverTimestamp(), lastSeen: serverTimestamp() }));
    await assertFails(updateDoc(me, { commitHash: 'c'.repeat(64), committedAt: serverTimestamp(), lastSeen: serverTimestamp() }));
  });

  it('不能修改對手的玩家資料', async () => {
    await seedRoom({ guest: true });
    await assertFails(updateDoc(doc(as(GUEST), 'rooms', ROOM, 'players', HOST), { surrendered: true, lastSeen: serverTimestamp() }));
  });

  it('放棄之後不能反悔', async () => {
    await seedRoom({ guest: true });
    const me = doc(as(GUEST), 'rooms', ROOM, 'players', GUEST);
    await assertSucceeds(updateDoc(me, { surrendered: true, lastSeen: serverTimestamp() }));
    await assertFails(updateDoc(me, { surrendered: false, lastSeen: serverTimestamp() }));
  });
});

describe('猜測', () => {
  it('雙方都設定好密碼才能開始猜', async () => {
    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: false });
    await assertFails(setDoc(doc(as(HOST), 'rooms', ROOM, 'guesses', `${HOST}_0123`), newGuess(HOST, GUEST, '0123')));
  });

  it('只能以自己的身分猜對手；文件 ID 必須是「猜的人_猜測」', async () => {
    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: true });
    const guesses = (uid: string, id: string) => doc(as(uid), 'rooms', ROOM, 'guesses', id);

    await assertSucceeds(setDoc(guesses(HOST, `${HOST}_0123`), newGuess(HOST, GUEST, '0123')));
    await assertFails(setDoc(guesses(HOST, `${GUEST}_4567`), newGuess(GUEST, HOST, '4567')));
    await assertFails(setDoc(guesses(HOST, `${HOST}_4567`), newGuess(HOST, HOST, '4567')));
    await assertFails(setDoc(guesses(HOST, 'whatever'), newGuess(HOST, GUEST, '4567')));
    await assertFails(setDoc(guesses(STRANGER, `${STRANGER}_4567`), newGuess(STRANGER, GUEST, '4567')));
  });

  it('不合法的猜測被擋下（避免誠實的一方無法判定而被判逾時）', async () => {
    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: true });
    for (const bad of ['1123', '12a4', '123', '12345']) {
      await assertFails(setDoc(doc(as(HOST), 'rooms', ROOM, 'guesses', `${HOST}_${bad}`), newGuess(HOST, GUEST, bad)));
    }
  });

  it('同一組不能猜兩次', async () => {
    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: true });
    await seedGuess(HOST, GUEST, '0123');
    await assertFails(setDoc(doc(as(HOST), 'rooms', ROOM, 'guesses', `${HOST}_0123`), newGuess(HOST, GUEST, '0123')));
  });

  it('判定：只有密碼持有者能寫、只能寫一次', async () => {
    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: true });
    await seedGuess(HOST, GUEST, '0123');
    const judged = (uid: string) => doc(as(uid), 'rooms', ROOM, 'guesses', `${HOST}_0123`);

    await assertFails(updateDoc(judged(HOST), { feedback: { A: 4, B: 0 }, judgedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(judged(GUEST), { feedback: { A: 1, B: 2 }, judgedAt: serverTimestamp() }));
    await assertFails(updateDoc(judged(GUEST), { feedback: { A: 0, B: 0 }, judgedAt: serverTimestamp() }));
  });

  it('判定：不合理的 xAyB 被擋下', async () => {
    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: true });
    const cases = [
      { A: 3, B: 1 },
      { A: 5, B: 0 },
      { A: 2, B: 3 },
      { A: -1, B: 0 },
    ];
    for (const [i, feedback] of cases.entries()) {
      const guess = ['0123', '4567', '8901', '2345'][i]!;
      await seedGuess(HOST, GUEST, guess);
      await assertFails(
        updateDoc(doc(as(GUEST), 'rooms', ROOM, 'guesses', `${HOST}_${guess}`), { feedback, judgedAt: serverTimestamp() }),
      );
    }
  });
});

describe('公開密碼', () => {
  it('只有本人能公開；寫入後不可修改；非成員讀不到', async () => {
    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: true });
    const reveal = { code: '4721', salt: SALT, createdAt: serverTimestamp(), expiresAt };

    await assertFails(setDoc(doc(as(HOST), 'rooms', ROOM, 'reveals', GUEST), reveal));
    await assertSucceeds(setDoc(doc(as(GUEST), 'rooms', ROOM, 'reveals', GUEST), reveal));
    await assertFails(setDoc(doc(as(GUEST), 'rooms', ROOM, 'reveals', GUEST), { ...reveal, code: '0856' }));
    await assertSucceeds(getDoc(doc(as(HOST), 'rooms', ROOM, 'reveals', GUEST)));
    await assertFails(getDoc(doc(as(STRANGER), 'rooms', ROOM, 'reveals', GUEST)));
  });

  it('公開的密碼與鹽必須格式正確', async () => {
    await seedRoom({ guest: true });
    const me = doc(as(GUEST), 'rooms', ROOM, 'reveals', GUEST);
    await assertFails(setDoc(me, { code: '1123', salt: SALT, createdAt: serverTimestamp(), expiresAt }));
    await assertFails(setDoc(me, { code: '4721', salt: 'short', createdAt: serverTimestamp(), expiresAt }));
  });
});

describe('申訴：斷線、判定逾時、未公開密碼（伺服器驗證時間條件）', () => {
  const claim = (type: string, against: string, guessId: string | null = null) => ({
    type,
    claimant: HOST,
    against,
    guessId,
    createdAt: serverTimestamp(),
    expiresAt,
  });
  const claimRef = (uid: string, id: string) => doc(as(uid), 'rooms', ROOM, 'claims', id);

  async function seedReveal(uid: string, createdAgoMs: number) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'rooms', ROOM, 'reveals', uid), {
        code: uid === HOST ? '4721' : '0856',
        salt: SALT,
        createdAt: Timestamp.fromMillis(Date.now() - createdAgoMs),
        expiresAt,
      });
    });
  }

  it('對手超過 60 秒沒有心跳，才能申訴斷線', async () => {
    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: true });
    await assertFails(setDoc(claimRef(HOST, `disconnect_${GUEST}`), claim('disconnect', GUEST)));

    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: true, guestLastSeenAgoMs: 120_000 });
    await assertSucceeds(setDoc(claimRef(HOST, `disconnect_${GUEST}`), claim('disconnect', GUEST)));
  });

  it('不能申訴自己，也不能冒用別人的名義', async () => {
    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: true, guestLastSeenAgoMs: 120_000 });
    await assertFails(setDoc(claimRef(HOST, `disconnect_${HOST}`), claim('disconnect', HOST)));
    await assertFails(setDoc(claimRef(HOST, `disconnect_${GUEST}`), { ...claim('disconnect', GUEST), claimant: GUEST }));
    await assertFails(
      setDoc(claimRef(STRANGER, `disconnect_${GUEST}`), { ...claim('disconnect', GUEST), claimant: STRANGER }),
    );
  });

  it('自己的猜測超過 60 秒沒被判定，才能申訴判定逾時', async () => {
    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: true });
    await seedGuess(HOST, GUEST, '0123');
    await assertFails(
      setDoc(claimRef(HOST, `judge-timeout_${GUEST}`), claim('judge-timeout', GUEST, `${HOST}_0123`)),
    );

    await seedGuess(HOST, GUEST, '4567', 120_000);
    await assertSucceeds(
      setDoc(claimRef(HOST, `judge-timeout_${GUEST}`), claim('judge-timeout', GUEST, `${HOST}_4567`)),
    );
  });

  it('已經判定過的猜測、不是自己的猜測，都不能拿來申訴判定逾時', async () => {
    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: true });
    await seedGuess(HOST, GUEST, '0123', 120_000, { A: 1, B: 1 });
    await seedGuess(GUEST, HOST, '4567', 120_000);

    await assertFails(
      setDoc(claimRef(HOST, `judge-timeout_${GUEST}`), claim('judge-timeout', GUEST, `${HOST}_0123`)),
    );
    await assertFails(
      setDoc(claimRef(HOST, `judge-timeout_${GUEST}`), claim('judge-timeout', GUEST, `${GUEST}_4567`)),
    );
  });

  it('自己公開超過 60 秒而對手仍未公開，才能申訴未公開密碼', async () => {
    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: true });
    await seedReveal(HOST, 0);
    await assertFails(setDoc(claimRef(HOST, `no-reveal_${GUEST}`), claim('no-reveal', GUEST)));

    await seedReveal(HOST, 120_000);
    await assertSucceeds(setDoc(claimRef(HOST, `no-reveal_${GUEST}`), claim('no-reveal', GUEST)));
  });

  it('對手已經公開，就不能申訴未公開', async () => {
    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: true });
    await seedReveal(HOST, 120_000);
    await seedReveal(GUEST, 0);
    await assertFails(setDoc(claimRef(HOST, `no-reveal_${GUEST}`), claim('no-reveal', GUEST)));
  });

  it('申訴寫入後不可修改或刪除', async () => {
    await seedRoom({ guest: true, hostCommitted: true, guestCommitted: true, guestLastSeenAgoMs: 120_000 });
    const ref = claimRef(HOST, `disconnect_${GUEST}`);
    await assertSucceeds(setDoc(ref, claim('disconnect', GUEST)));
    await assertFails(updateDoc(ref, { type: 'judge-timeout' }));
    await assertFails(deleteDoc(ref));
  });
});
