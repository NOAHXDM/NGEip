/**
 * 從正式環境同步 Firestore 資料到本地模擬器
 *
 * 用途：將正式環境的 Firestore 資料完整複製到本地模擬器，方便本地開發測試
 *
 * 使用方式：
 * node sync-from-prod.js [options]
 *
 * Options:
 *   --collections <names>  只同步指定的 collections（逗號分隔）
 *   --exclude <names>      排除指定的 collections（逗號分隔）
 *   --dry-run             試運行模式，不實際寫入資料
 *
 * 範例：
 * node sync-from-prod.js                                    # 同步所有資料
 * node sync-from-prod.js --collections users,attendanceLogs # 只同步特定 collections
 * node sync-from-prod.js --exclude systemConfig             # 排除特定 collections
 * node sync-from-prod.js --dry-run                          # 試運行
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 解析命令列參數
function parseArgs() {
  const args = {
    collections: null, // null 表示同步所有
    exclude: [],
    dryRun: false,
    skipDelay: false // 跳過 5 秒延遲
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--collections' && i + 1 < process.argv.length) {
      args.collections = process.argv[++i].split(',').map(c => c.trim());
    } else if (arg === '--exclude' && i + 1 < process.argv.length) {
      args.exclude = process.argv[++i].split(',').map(c => c.trim());
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--now' || arg === '-y') {
      args.skipDelay = true;
    }
  }

  return args;
}

// 初始化 Firebase Admin - 正式環境
function initProdFirestore() {
  const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `找不到 Service Account Key 檔案: ${serviceAccountPath}\n` +
      '請從 Firebase Console 下載並命名為 serviceAccountKey.json'
    );
  }

  const serviceAccount = require(serviceAccountPath);

  const prodApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  }, 'prod');

  return prodApp.firestore();
}

// 初始化 Firebase Admin - 模擬器
function initEmulatorFirestore() {
  const emulatorApp = admin.initializeApp({
    projectId: 'noahxdm-eip'
  }, 'emulator');

  const emulatorDb = emulatorApp.firestore();
  emulatorDb.settings({
    host: 'localhost:8080',
    ssl: false
  });

  return emulatorDb;
}

/**
 * 遞迴讀取 collection 的所有文件及子集合
 */
async function readCollection(db, collectionPath, depth = 0) {
  const indent = '  '.repeat(depth);
  console.log(`${indent}📂 讀取: ${collectionPath}`);

  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.get();

  const documents = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // 讀取子集合
    const subcollections = await doc.ref.listCollections();
    const subcollectionData = {};

    for (const subcollection of subcollections) {
      const subcollectionPath = `${collectionPath}/${doc.id}/${subcollection.id}`;
      subcollectionData[subcollection.id] = await readCollection(db, subcollectionPath, depth + 1);
    }

    documents.push({
      id: doc.id,
      data,
      subcollections: subcollectionData
    });
  }

  console.log(`${indent}  ✓ ${documents.length} 筆文件`);
  return documents;
}

/**
 * 遞迴寫入 collection 的所有文件及子集合
 */
async function writeCollection(db, collectionPath, documents, depth = 0, dryRun = false) {
  const indent = '  '.repeat(depth);

  if (dryRun) {
    console.log(`${indent}📝 [試運行] 寫入: ${collectionPath} (${documents.length} 筆)`);

    for (const doc of documents) {
      if (Object.keys(doc.subcollections).length > 0) {
        for (const [subcollectionId, subcollectionDocs] of Object.entries(doc.subcollections)) {
          const subcollectionPath = `${collectionPath}/${doc.id}/${subcollectionId}`;
          await writeCollection(db, subcollectionPath, subcollectionDocs, depth + 1, dryRun);
        }
      }
    }
    return;
  }

  console.log(`${indent}📝 寫入: ${collectionPath} (${documents.length} 筆)`);

  // 使用批次寫入（每批最多 500 筆）
  const BATCH_SIZE = 500;

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const batchDocs = documents.slice(i, i + BATCH_SIZE);

    console.log(`${indent}  → 準備批次寫入: ${batchDocs.length} 筆`);

    for (const doc of batchDocs) {
      const docRef = db.collection(collectionPath).doc(doc.id);
      batch.set(docRef, doc.data);
    }

    console.log(`${indent}  → 執行 batch.commit()...`);
    await batch.commit();
    console.log(`${indent}  ✓ 已寫入 ${Math.min(i + BATCH_SIZE, documents.length)}/${documents.length}`);
  }

  // 遞迴寫入子集合
  for (const doc of documents) {
    if (Object.keys(doc.subcollections).length > 0) {
      for (const [subcollectionId, subcollectionDocs] of Object.entries(doc.subcollections)) {
        const subcollectionPath = `${collectionPath}/${doc.id}/${subcollectionId}`;
        await writeCollection(db, subcollectionPath, subcollectionDocs, depth + 1, dryRun);
      }
    }
  }
}

/**
 * 同步資料
 */
async function syncData() {
  console.log('====================================');
  console.log('  Firestore 資料同步工具');
  console.log('  正式環境 → 本地模擬器');
  console.log('====================================\n');

  const args = parseArgs();

  if (args.dryRun) {
    console.log('⚠️  試運行模式：不會實際寫入資料\n');
  }

  // 初始化 Firestore 連線
  console.log('🔌 初始化連線...');
  const prodDb = initProdFirestore();
  const emulatorDb = initEmulatorFirestore();
  console.log('  ✓ 正式環境已連線');
  console.log('  ✓ 模擬器已連線\n');

  // 取得所有 collections
  console.log('📋 取得 collection 列表...');
  const collections = await prodDb.listCollections();
  const collectionNames = collections.map(c => c.id);
  console.log(`  找到 ${collectionNames.length} 個 collections: ${collectionNames.join(', ')}\n`);

  // 過濾要同步的 collections
  let collectionsToSync = collectionNames;

  if (args.collections) {
    collectionsToSync = collectionsToSync.filter(name => args.collections.includes(name));
    console.log(`📌 只同步: ${collectionsToSync.join(', ')}\n`);
  }

  if (args.exclude.length > 0) {
    collectionsToSync = collectionsToSync.filter(name => !args.exclude.includes(name));
    console.log(`🚫 排除: ${args.exclude.join(', ')}\n`);
  }

  if (collectionsToSync.length === 0) {
    console.log('⚠️  沒有要同步的 collections');
    return;
  }

  // 統計資料
  const stats = {
    collections: 0,
    documents: 0,
    startTime: Date.now()
  };

  // 同步每個 collection
  for (const collectionName of collectionsToSync) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🔄 同步 collection: ${collectionName}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    try {
      // 從正式環境讀取
      const documents = await readCollection(prodDb, collectionName);
      stats.documents += documents.length;

      // 寫入模擬器
      await writeCollection(emulatorDb, collectionName, documents, 0, args.dryRun);

      stats.collections++;
      console.log(`\n✓ ${collectionName} 同步完成`);

    } catch (error) {
      console.error(`\n✗ ${collectionName} 同步失敗:`, error.message);
    }
  }

  // 輸出統計
  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(2);

  console.log('\n====================================');
  console.log('  同步完成統計');
  console.log('====================================');
  console.log(`Collections: ${stats.collections}/${collectionsToSync.length}`);
  console.log(`Documents: ${stats.documents} 筆`);
  console.log(`耗時: ${duration} 秒`);
  console.log('====================================\n');

  if (args.dryRun) {
    console.log('ℹ️  這是試運行，沒有實際寫入資料');
    console.log('   移除 --dry-run 參數以執行實際同步\n');
  }
}

// 主程式
if (require.main === module) {
  console.log('⚠️  重要提醒：');
  console.log('1. 確保本地模擬器正在運行 (npm start)');
  console.log('2. 確保已放置 serviceAccountKey.json 在此目錄');
  console.log('3. 此操作會覆蓋模擬器中的現有資料\n');

  const args = parseArgs();

  const runSync = () => {
    syncData()
      .then(() => {
        if (args.dryRun) {
          console.log('\n✓ 試運行完成');
        } else {
          console.log('\n✓ 所有資料同步完成');
        }
        process.exit(0);
      })
      .catch(error => {
        console.error('\n✗ 同步失敗:', error);
        console.error('錯誤堆疊:', error.stack);
        process.exit(1);
      });
  };

  if (!args.dryRun && !args.skipDelay) {
    console.log('按下 Ctrl+C 取消，或等待 5 秒後開始同步...');
    console.log('(使用 --now 或 -y 參數可立即執行)\n');
    setTimeout(runSync, 5000);
  } else {
    if (args.skipDelay) {
      console.log('立即執行模式\n');
    }
    runSync();
  }
}

module.exports = { syncData };
