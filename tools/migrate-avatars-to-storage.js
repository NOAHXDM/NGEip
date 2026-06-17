/**
 * 一次性頭像搬遷腳本：Cloudinary → Firebase Storage
 *
 * 將 Firestore `users` 中仍指向 Cloudinary 的頭像，逐一搬到 Firebase Storage
 * 的確定性路徑 `avatars/{uid}/avatar.webp`，並回寫 `photoUrl` 為 Storage 下載 URL。
 *
 * 特性：
 *  - 冪等：photoUrl 已是 Firebase Storage 者跳過。
 *  - 篩選：只搬「仍為 Cloudinary 網域」且「無 exitDate（在職）」的使用者。
 *  - 省成本：透過 Cloudinary 轉換參數先要求縮圖 webp（w_512,c_limit,f_webp,q_80），
 *    下載的就是壓縮後小圖，無需在本機安裝 sharp 之類的影像套件。
 *  - 安全：預設 dry-run，僅列出將執行的動作；加 `--apply` 才真正寫入。
 *
 * 前置：
 *  1. npm i -D firebase-admin            （尚未安裝）
 *  2. 服務帳戶金鑰：設定環境變數
 *     export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *  3. Node 18+（使用內建 fetch / crypto.randomUUID）
 *
 * 用法：
 *   node tools/migrate-avatars-to-storage.js            # dry-run（預設）
 *   node tools/migrate-avatars-to-storage.js --apply    # 實際搬遷
 */

const crypto = require('crypto');
// firebase-admin v12+ 採模組化子路徑匯出
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const BUCKET_NAME = 'noahxdm-eip.firebasestorage.app';
const APPLY = process.argv.includes('--apply');

// 認證取自環境變數 GOOGLE_APPLICATION_CREDENTIALS（applicationDefault）
initializeApp({
  credential: applicationDefault(),
  storageBucket: BUCKET_NAME,
});

const db = getFirestore();
const bucket = getStorage().bucket();

/** 是否為 Cloudinary 圖片網址。 */
function isCloudinaryUrl(url) {
  return typeof url === 'string' && url.includes('res.cloudinary.com');
}

/** 是否已是 Firebase Storage 下載網址（冪等判斷）。 */
function isStorageUrl(url) {
  return typeof url === 'string' && url.includes('firebasestorage');
}

/**
 * 在 Cloudinary URL 的 /upload/ 後插入縮圖／webp 轉換參數。
 * 例：.../image/upload/v123/abc.jpg → .../image/upload/w_512,c_limit,f_webp,q_80/v123/abc.jpg
 */
function toResizedWebpUrl(cloudinaryUrl) {
  return cloudinaryUrl.replace(
    /\/upload\//,
    '/upload/w_512,c_limit,f_webp,q_80/'
  );
}

/** 確定性 Storage 路徑。 */
function avatarPath(uid) {
  return `avatars/${uid}/avatar.webp`;
}

/** 由路徑與下載 token 組出與前端 getDownloadURL 一致的下載網址。 */
function buildDownloadUrl(path, token) {
  const encoded = encodeURIComponent(path);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encoded}?alt=media&token=${token}`;
}

async function migrateOne(uid, photoUrl) {
  const resizedUrl = toResizedWebpUrl(photoUrl);
  const res = await fetch(resizedUrl);
  if (!res.ok) {
    throw new Error(`下載失敗 HTTP ${res.status}：${resizedUrl}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  const path = avatarPath(uid);
  const token = crypto.randomUUID();
  await bucket.file(path).save(buffer, {
    resumable: false,
    metadata: {
      contentType: 'image/webp',
      cacheControl: 'public,max-age=604800',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const downloadUrl = buildDownloadUrl(path, token);
  await db.collection('users').doc(uid).update({ photoUrl: downloadUrl });
  return { path, bytes: buffer.length, downloadUrl };
}

async function main() {
  console.log(
    `=== 頭像搬遷 ${APPLY ? '（APPLY 實際執行）' : '（DRY-RUN 僅預覽）'} ===`
  );

  const snapshot = await db.collection('users').get();
  const candidates = [];
  let skippedExited = 0;
  let skippedAlready = 0;
  let skippedNoPhoto = 0;

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const uid = docSnap.id;
    const photoUrl = data.photoUrl;

    if (!photoUrl) return skippedNoPhoto++;
    if (isStorageUrl(photoUrl)) return skippedAlready++;
    if (!isCloudinaryUrl(photoUrl)) return; // 非 Cloudinary 也非 Storage，略過
    if (data.exitDate) return skippedExited++; // 已離職者不搬

    candidates.push({ uid, name: data.name, photoUrl });
  });

  console.log(
    `總使用者 ${snapshot.size}｜待搬遷 ${candidates.length}｜` +
      `已在 Storage ${skippedAlready}｜離職略過 ${skippedExited}｜無頭像 ${skippedNoPhoto}`
  );

  let ok = 0;
  let failed = 0;
  for (const c of candidates) {
    if (!APPLY) {
      console.log(`  [DRY] ${c.uid}（${c.name ?? ''}）← ${c.photoUrl}`);
      continue;
    }
    try {
      const r = await migrateOne(c.uid, c.photoUrl);
      ok++;
      console.log(`  [OK]  ${c.uid}（${c.name ?? ''}）→ ${r.path}（${r.bytes} bytes）`);
    } catch (err) {
      failed++;
      console.error(`  [ERR] ${c.uid}（${c.name ?? ''}）：${err.message}`);
    }
  }

  if (APPLY) {
    console.log(`=== 完成：成功 ${ok}｜失敗 ${failed} ===`);
  } else {
    console.log('=== DRY-RUN 結束。確認名單無誤後加 --apply 實際執行。 ===');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('搬遷中止：', err);
    process.exit(1);
  });
