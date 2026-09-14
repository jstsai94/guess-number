/**
 * Firebase 網頁應用程式設定。
 *
 * 這些是公開識別碼，放在前端本來就看得到，可以進版控；
 * 資料安全由 firestore.rules 保護，不是靠隱藏這組設定。
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyA8Ys8nNuEx6vSP4oE_M4uSW4PxRYhSFVU',
  authDomain: 'guess-number-ae8ee.firebaseapp.com',
  projectId: 'guess-number-ae8ee',
  storageBucket: 'guess-number-ae8ee.firebasestorage.app',
  messagingSenderId: '336585050308',
  appId: '1:336585050308:web:30c67ec48df4de196ae191',
} as const;
