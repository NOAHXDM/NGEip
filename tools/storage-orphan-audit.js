/**
 * Storage 孤兒檔稽核腳本（取代舊的 cloudinary-cleanup.js）
 *
 * 列出 Firebase Storage `avatars/` 下的所有物件，與 Firestore `users` 全體
 * `photoUrl` 比對，找出「Storage 有檔、但沒有任何使用者參照」的孤兒檔。
 *
 * 在確定性路徑覆寫策略下，平時孤兒檔應為 0；本腳本作為稽核安全網，
 * 用於偵測離職刪檔遺漏、手動上傳殘留等例外狀況。
 *
 * 特性：
 *  - 預設 dry-run，僅列出孤兒檔；加 `--delete` 才實際刪除。
 *  - 比對基準為「Firestore 仍引用的 Storage 路徑集合」。
 *
 * 前置：同 migrate-avatars-to-storage.js
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *
 * 用法：
 *   node tools/storage-orphan-audit.js            # 稽核（僅列出）
 *   node tools/storage-orphan-audit.js --delete   # 列出並刪除孤兒檔
 */

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const BUCKET_NAME = 'noahxdm-eip.firebasestorage.app';
const AVATAR_PREFIX = 'avatars/';
const DELETE = process.argv.includes('--delete');

initializeApp({
  credential: applicationDefault(),
  storageBucket: BUCKET_NAME,
});

const db = getFirestore();
const bucket = getStorage().bucket();

/** 從下載 URL 還原 Storage 物件路徑（解析 /o/{encodedPath}）。 */
function pathFromDownloadUrl(url) {
  if (typeof url !== 'string') return null;
  const match = url.match(/\/o\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function main() {
  console.log(
    `=== Storage 孤兒檔稽核 ${DELETE ? '（DELETE 實際刪除）' : '（僅列出）'} ===`
  );

  // 1. Firestore 仍引用的 Storage 路徑集合
  const snapshot = await db.collection('users').get();
  const referenced = new Set();
  snapshot.forEach((docSnap) => {
    const path = pathFromDownloadUrl(docSnap.data().photoUrl);
    if (path && path.startsWith(AVATAR_PREFIX)) {
      referenced.add(path);
    }
  });

  // 2. Storage 中 avatars/ 下的所有物件
  const [files] = await bucket.getFiles({ prefix: AVATAR_PREFIX });
  const orphans = files.filter((file) => !referenced.has(file.name));

  console.log(
    `Storage 物件 ${files.length}｜Firestore 引用 ${referenced.size}｜孤兒檔 ${orphans.length}`
  );

  if (orphans.length === 0) {
    console.log('=== 無孤兒檔，Storage 與 Firestore 一致。 ===');
    return;
  }

  for (const file of orphans) {
    if (!DELETE) {
      console.log(`  [ORPHAN] ${file.name}`);
      continue;
    }
    try {
      await file.delete();
      console.log(`  [DELETED] ${file.name}`);
    } catch (err) {
      console.error(`  [ERR] ${file.name}：${err.message}`);
    }
  }

  if (!DELETE) {
    console.log('=== 僅列出。確認後加 --delete 實際刪除。 ===');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('稽核中止：', err);
    process.exit(1);
  });
