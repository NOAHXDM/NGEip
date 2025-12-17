/**
 * 進修課程補助遷移腳本
 *
 * 用途：將進修課程補助從 JSON 遷移到 Firestore
 *
 * 使用方式：
 * node migrate-training-courses.js <json檔案路徑>
 *
 * 範例：
 * # 本地模擬器（預設）
 * node migrate-training-courses.js ./training-courses.json
 *
 * # 正式環境（需要 serviceAccountKey.json）
 * USE_PRODUCTION=true node migrate-training-courses.js ./training-courses.json
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 判斷是否使用正式環境
const USE_PRODUCTION = process.env.USE_PRODUCTION === 'true';

// 初始化 Firebase Admin
if (!admin.apps.length) {
  if (USE_PRODUCTION) {
    // === 正式環境配置 ===
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

    console.log('⚠️  警告：使用正式環境 Firestore');
    console.log(`專案 ID: ${serviceAccount.project_id}`);
    console.log('');
  } else {
    // === 模擬器配置 ===
    admin.initializeApp({
      projectId: 'noahxdm-eip'
    });

    // 連接到模擬器
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

    console.log('✓ 使用本地模擬器 (localhost:8080)');
    console.log('');
  }
}

const db = admin.firestore();

// 補助類型
const SubsidyType = {
  Laptop: 1,
  HealthCheck: 2,
  Training: 3,
  AITool: 4,
  Travel: 5
};

// 補助狀態
const SubsidyStatus = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected'
};

/**
 * 根據員工姓名查詢 userId
 */
async function getUserIdByName(name, userCache = {}) {
  // 使用快取避免重複查詢
  if (userCache[name]) {
    return userCache[name];
  }

  const usersSnapshot = await db.collection('users')
    .where('name', '==', name)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    return null;
  }

  const userId = usersSnapshot.docs[0].id;
  userCache[name] = userId;
  return userId;
}

/**
 * 解析日期字串 (支援 YYYY-MM-DD 格式)
 */
function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  dateStr = dateStr.trim();

  // 解析 YYYY-MM-DD 格式
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // 嘗試直接解析
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }

  return null;
}

/**
 * 建立稽核軌跡記錄
 */
async function createAuditTrail(transaction, applicationRef, actionBy, action, content = null) {
  const auditRef = applicationRef.collection('auditTrail').doc();

  transaction.set(auditRef, {
    action,
    actionBy,
    actionDateTime: admin.firestore.Timestamp.now(),
    content: content ? JSON.stringify(content) : null
  });
}

/**
 * 遷移進修課程補助
 */
async function migrateTrainingCourses(jsonFilePath) {
  console.log(`\n開始遷移進修課程補助...`);
  console.log(`JSON 檔案: ${jsonFilePath}\n`);

  // 讀取 JSON 檔案
  if (!fs.existsSync(jsonFilePath)) {
    throw new Error(`找不到檔案: ${jsonFilePath}`);
  }

  const courses = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

  if (!Array.isArray(courses) || courses.length === 0) {
    throw new Error(`JSON 檔案格式錯誤或資料為空`);
  }

  console.log(`找到 ${courses.length} 筆課程補助資料\n`);

  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;
  const errors = [];
  const userCache = {}; // 快取使用者 ID

  // 處理每筆課程補助
  for (let i = 0; i < courses.length; i++) {
    const course = courses[i];
    const displayIndex = i + 1;

    try {
      // 驗證必要欄位
      if (!course.userName) {
        console.warn(`  ⚠ 第 ${displayIndex} 筆：缺少使用者名稱，跳過`);
        skippedCount++;
        continue;
      }

      if (!course.applicationDate) {
        console.warn(`  ⚠ 第 ${displayIndex} 筆：缺少申請日期，跳過`);
        skippedCount++;
        continue;
      }

      if (!course.courseName) {
        console.warn(`  ⚠ 第 ${displayIndex} 筆：缺少課程名稱，跳過`);
        skippedCount++;
        continue;
      }

      // 查詢使用者 ID
      const userId = await getUserIdByName(course.userName, userCache);

      if (!userId) {
        console.warn(`  ⚠ 第 ${displayIndex} 筆：找不到使用者 "${course.userName}"，跳過`);
        skippedCount++;
        continue;
      }

      // 解析日期
      const applicationDate = parseDate(course.applicationDate);
      const issuanceDate = course.issuanceDate ? parseDate(course.issuanceDate) : null;

      if (!applicationDate) {
        console.warn(`  ⚠ 第 ${displayIndex} 筆：申請日期格式錯誤 "${course.applicationDate}"，跳過`);
        skippedCount++;
        continue;
      }

      // 準備補助申請資料
      const subsidyData = {
        userId,
        type: SubsidyType.Training,
        status: SubsidyStatus.Approved, // 歷史資料都是已核准
        applicationDate: admin.firestore.Timestamp.fromDate(applicationDate),
        approvedAmount: course.appliedAmount || 0,
        content: course.courseName,
        invoiceAmount: course.invoiceAmount || 0,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now()
      };

      // 如果有核發日期，加入備註
      let notes = [];
      if (issuanceDate) {
        notes.push(`核發日期: ${course.issuanceDate}`);
      }
      if (course.travelExpense) {
        notes.push(`車馬費: NT$ ${course.travelExpense}`);
      }
      if (course.accommodation) {
        notes.push(`住宿: NT$ ${course.accommodation}`);
      }
      if (course.totalExpense) {
        notes.push(`總費用: NT$ ${course.totalExpense}`);
      }

      if (notes.length > 0) {
        subsidyData.notes = notes.join(' | ');
      }

      // 使用交易建立補助申請和稽核軌跡
      await db.runTransaction(async (transaction) => {
        const applicationRef = db.collection('subsidyApplications').doc();

        // 建立補助申請
        transaction.set(applicationRef, subsidyData);

        // 建立稽核軌跡（系統遷移）
        await createAuditTrail(
          transaction,
          applicationRef,
          'system', // 系統遷移
          'create',
          {
            source: 'migration',
            originalData: course
          }
        );
      });

      console.log(`  ✓ 第 ${displayIndex} 筆：${course.userName} - ${course.courseName} (NT$ ${course.appliedAmount})`);
      successCount++;

    } catch (error) {
      console.error(`  ✗ 第 ${displayIndex} 筆失敗：${error.message}`);
      failCount++;
      errors.push({
        index: displayIndex,
        course: course.courseName,
        userName: course.userName,
        error: error.message
      });
    }
  }

  // 輸出結果
  console.log(`\n============================================================`);
  console.log(`遷移完成！`);
  console.log(`============================================================`);
  console.log(`✓ 成功: ${successCount} 筆`);
  console.log(`⚠ 跳過: ${skippedCount} 筆`);
  console.log(`✗ 失敗: ${failCount} 筆`);
  console.log(`總計處理: ${courses.length} 筆`);

  if (errors.length > 0) {
    console.log(`\n錯誤詳情:`);
    errors.forEach(({ index, course, userName, error }) => {
      console.log(`  - 第 ${index} 筆 (${userName} - ${course}): ${error}`);
    });
  }

  // 顯示使用者統計
  console.log(`\n============================================================`);
  console.log(`使用者統計`);
  console.log(`============================================================`);
  const userStats = {};
  courses.forEach(course => {
    if (course.userName && course.appliedAmount) {
      if (!userStats[course.userName]) {
        userStats[course.userName] = {
          count: 0,
          totalAmount: 0
        };
      }
      userStats[course.userName].count++;
      userStats[course.userName].totalAmount += course.appliedAmount;
    }
  });

  Object.entries(userStats)
    .sort((a, b) => b[1].totalAmount - a[1].totalAmount)
    .forEach(([userName, stats]) => {
      console.log(`${userName.padEnd(10, ' ')} - ${stats.count} 門課程，NT$ ${stats.totalAmount.toLocaleString()}`);
    });
}

// 主程式
if (require.main === module) {
  if (process.argv.length < 3) {
    console.error('使用方式: node migrate-training-courses.js <json檔案路徑>');
    console.error('範例: node migrate-training-courses.js ./training-courses.json');
    process.exit(1);
  }

  const jsonFilePath = path.resolve(process.argv[2]);

  migrateTrainingCourses(jsonFilePath)
    .then(() => {
      console.log('\n✓ 進修課程補助遷移完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ 遷移失敗:', error);
      process.exit(1);
    });
}

module.exports = { migrateTrainingCourses };
