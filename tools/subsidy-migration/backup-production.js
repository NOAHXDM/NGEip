/**
 * 正式環境 Firestore 備份腳本
 *
 * 用途：在執行遷移前備份相關集合
 *
 * 使用方式：
 * node backup-production.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 初始化 Firebase Admin（正式環境）
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ 錯誤：找不到 serviceAccountKey.json');
  console.error('請先從 Firebase Console 下載 Service Account Key');
  console.error('參考文件：README_PRODUCTION.md');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

console.log('⚠️  正式環境備份工具');
console.log(`專案 ID: ${serviceAccount.project_id}`);
console.log('');

/**
 * 備份單一集合
 */
async function backupCollection(collectionName) {
  console.log(`正在備份 ${collectionName}...`);

  const snapshot = await db.collection(collectionName).get();
  const data = [];

  // 讀取所有文件
  for (const doc of snapshot.docs) {
    const docData = doc.data();

    // 轉換 Timestamp 為 ISO 字串（便於 JSON 儲存）
    const convertedData = convertTimestamps(docData);

    data.push({
      id: doc.id,
      ...convertedData
    });
  }

  // 建立備份目錄
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }

  // 儲存備份檔案
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const filename = path.join(backupDir, `${collectionName}_${timestamp}.json`);

  fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');

  console.log(`✓ ${collectionName}: ${data.length} 筆 → ${filename}`);

  return data.length;
}

/**
 * 轉換 Firestore Timestamp 為 ISO 字串
 */
function convertTimestamps(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof admin.firestore.Timestamp) {
    return obj.toDate().toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map(item => convertTimestamps(item));
  }

  if (typeof obj === 'object') {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertTimestamps(value);
    }
    return converted;
  }

  return obj;
}

/**
 * 主程式
 */
async function main() {
  console.log('開始備份相關集合...\n');

  const collections = [
    'subsidyApplications',
    'mealSubsidies',
    'userMealStats',
    'users' // 也備份使用者資料以供對照
  ];

  let totalCount = 0;

  for (const collectionName of collections) {
    try {
      const count = await backupCollection(collectionName);
      totalCount += count;
    } catch (error) {
      console.error(`✗ ${collectionName} 備份失敗:`, error.message);
    }
  }

  console.log('\n============================================================');
  console.log(`✓ 備份完成！總計 ${totalCount} 筆文件`);
  console.log('============================================================');
  console.log(`備份位置: ${path.join(__dirname, 'backups')}`);
  console.log('');
}

// 執行備份
main()
  .then(() => {
    console.log('✓ 備份作業完成');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n✗ 備份失敗:', error);
    process.exit(1);
  });
