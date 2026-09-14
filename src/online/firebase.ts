import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig';

export interface FirebaseHandles {
  readonly db: Firestore;
  /** 這個瀏覽器的匿名身分；重新整理後仍是同一個。 */
  readonly uid: string;
}

/**
 * 快取的是「連線」，不是遊戲狀態：同一個分頁只需要一個 Firebase 連線與一個匿名身分，
 * 畫面上若同時有多場對戰也共用它，不違反「不可有模組層級遊戲狀態」的紀律。
 */
let connecting: Promise<FirebaseHandles> | null = null;

/** 取得已登入的 Firebase 連線；第一次呼叫時才初始化並匿名登入。 */
export function getFirebase(): Promise<FirebaseHandles> {
  if (connecting === null) {
    connecting = (async () => {
      const app = initializeApp(firebaseConfig);
      const credential = await signInAnonymously(getAuth(app));
      return { db: getFirestore(app), uid: credential.user.uid };
    })();
    // 失敗時清掉快取，下次呼叫可以重試；錯誤仍會交給呼叫端處理
    connecting.catch(() => {
      connecting = null;
    });
  }
  return connecting;
}
