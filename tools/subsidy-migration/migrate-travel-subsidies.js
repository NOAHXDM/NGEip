/**
 * 旅遊補助遷移腳本
 *
 * 用途：將旅遊補助資料從 JSON 遷移到 Firestore
 *
 * 使用方式：
 * node migrate-travel-subsidies.js <json檔案路徑>
 *
 * 範例：
 * node migrate-travel-subsidies.js ./travel-subsidies.json
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 初始化 Firebase Admin（使用模擬器）
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'noahxdm-eip'
  });

  // 連接到模擬器
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
}

const db = admin.firestore();

// 補助類型定義
const SubsidyType = {
  Laptop: 1,       // 個人筆電
  HealthCheck: 2,  // 健檢
  Training: 3,     // 進修課程
  AITool: 4,       // AI 工具
  Travel: 5        // 旅遊
};

// 補助狀態定義
const SubsidyStatus = {
  Pending: 'pending',     // 待審核
  Approved: 'approved',   // 已核准
  Rejected: 'rejected'    // 已拒絕
};

/**
 * 根據員工姓名查詢 userId
 */
async function getUserIdByName(name) {
  const usersSnapshot = await db.collection('users')
    .where('name', '==', name)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    return null;
  }

  return usersSnapshot.docs[0].id;
}

/**
 * 解析日期字串為 Firestore Timestamp
 * @param {string} dateStr - YYYY-MM-DD 格式
 * @returns {admin.firestore.Timestamp}
 */
function parseTimestamp(dateStr) {
  if (!dateStr) return null;

  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return admin.firestore.Timestamp.fromDate(date);
}

/**
 * 建立補助申請記錄
 */
async function createSubsidyApplication(record, userId) {
  const applicationDate = parseTimestamp(record.applicationDate);

  // 建立補助申請文件
  const applicationData = {
    userId,
    type: SubsidyType.Travel,
    status: SubsidyStatus.Approved, // 歷史資料預設為已核准
    applicationDate,
    approvedAmount: record.amount,
    content: record.content,
    notes: `旅遊類型: ${record.travelType}`,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now()
  };

  // 新增到 subsidyApplications 集合
  const applicationRef = await db.collection('subsidyApplications').add(applicationData);

  // 建立稽核軌跡
  await applicationRef.collection('auditTrail').add({
    action: 'create',
    actionBy: 'system',
    actionDateTime: admin.firestore.Timestamp.now(),
    content: JSON.stringify({
      source: 'migration',
      originalData: record
    })
  });

  return applicationRef.id;
}

/**
 * 遷移旅遊補助資料
 */
async function migrateTravelSubsidies(jsonFilePath) {
  console.log(`\n開始遷移旅遊補助資料...`);
  console.log(`JSON 檔案: ${jsonFilePath}\n`);

  // 讀取 JSON 檔案
  if (!fs.existsSync(jsonFilePath)) {
    throw new Error(`找不到檔案: ${jsonFilePath}`);
  }

  const records = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`JSON 檔案格式錯誤或資料為空`);
  }

  console.log(`找到 ${records.length} 筆旅遊補助資料\n`);

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const errors = [];
  const userCache = {}; // 快取使用者 ID

  for (const record of records) {
    try {
      const { userName, applicationDate, amount, content, travelType } = record;

      // 驗證必要欄位
      if (!userName || !applicationDate || !amount || amount === 0) {
        console.warn(`⚠ 跳過無效記錄: ${userName} - 缺少必要欄位`);
        skipCount++;
        continue;
      }

      // 使用快取避免重複查詢
      let userId = userCache[userName];

      if (!userId) {
        userId = await getUserIdByName(userName);
        if (userId) {
          userCache[userName] = userId;
        }
      }

      if (!userId) {
        console.warn(`⚠ 找不到使用者: ${userName}，跳過`);
        skipCount++;
        continue;
      }

      // 建立補助申請
      const applicationId = await createSubsidyApplication(record, userId);

      console.log(`✓ ${userName} | ${travelType} | ${applicationDate} | NT$ ${amount.toLocaleString()} → ${applicationId}`);
      successCount++;

    } catch (error) {
      console.error(`✗ 失敗: ${record.userName} - ${error.message}`);
      failCount++;
      errors.push({
        record,
        error: error.message
      });
    }
  }

  // 輸出結果
  console.log(`\n============================================================`);
  console.log(`遷移完成！`);
  console.log(`============================================================`);
  console.log(`✓ 成功: ${successCount} 筆`);
  console.log(`⚠ 跳過: ${skipCount} 筆`);
  console.log(`✗ 失敗: ${failCount} 筆`);
  console.log(`總計處理: ${records.length} 筆`);

  if (errors.length > 0) {
    console.log(`\n錯誤詳情:`);
    errors.forEach(({ record, error }) => {
      console.log(`  - ${record.userName} (${record.applicationDate}): ${error}`);
    });
  }

  // 按類型統計
  console.log(`\n📊 補助類型統計:`);
  const typeStats = {};
  records.forEach(r => {
    if (!typeStats[r.travelType]) {
      typeStats[r.travelType] = { count: 0, amount: 0 };
    }
    typeStats[r.travelType].count++;
    typeStats[r.travelType].amount += r.amount;
  });

  Object.entries(typeStats).forEach(([type, stats]) => {
    console.log(`  ${type}: ${stats.count} 筆, NT$ ${stats.amount.toLocaleString()}`);
  });
}

// 主程式
if (require.main === module) {
  if (process.argv.length < 3) {
    console.error('使用方式: node migrate-travel-subsidies.js <json檔案路徑>');
    console.error('範例: node migrate-travel-subsidies.js ./travel-subsidies.json');
    process.exit(1);
  }

  const jsonFilePath = path.resolve(process.argv[2]);

  migrateTravelSubsidies(jsonFilePath)
    .then(() => {
      console.log('\n✓ 旅遊補助資料遷移完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ 遷移失敗:', error);
      process.exit(1);
    });
}

module.exports = { migrateTravelSubsidies };
