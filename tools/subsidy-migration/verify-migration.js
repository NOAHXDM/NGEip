/**
 * 遷移驗證腳本
 *
 * 用途：驗證補助資料遷移結果
 *
 * 使用方式：
 * # 驗證本地模擬器
 * node verify-migration.js
 *
 * # 驗證正式環境
 * USE_PRODUCTION=true node verify-migration.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 判斷是否使用正式環境
const USE_PRODUCTION = process.env.USE_PRODUCTION === 'true';

// 初始化 Firebase Admin
if (!admin.apps.length) {
  if (USE_PRODUCTION) {
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

    if (!fs.existsSync(serviceAccountPath)) {
      console.error('❌ 錯誤：找不到 serviceAccountKey.json');
      process.exit(1);
    }

    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log('⚠️  驗證正式環境 Firestore');
    console.log(`專案 ID: ${serviceAccount.project_id}\n`);
  } else {
    admin.initializeApp({
      projectId: 'noahxdm-eip'
    });
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

    console.log('✓ 驗證本地模擬器\n');
  }
}

const db = admin.firestore();

// 補助類型對照表
const SubsidyTypeLabels = {
  1: '個人筆電',
  2: '健檢補助',
  3: '進修課程',
  4: 'AI 工具',
  5: '旅遊補助'
};

// 補助狀態對照表
const SubsidyStatusLabels = {
  'pending': '待審核',
  'approved': '已核准',
  'rejected': '已拒絕'
};

/**
 * 驗證 subsidyApplications 集合
 */
async function verifySubsidyApplications() {
  console.log('============================================================');
  console.log('驗證 subsidyApplications 集合');
  console.log('============================================================\n');

  const snapshot = await db.collection('subsidyApplications').get();

  const stats = {
    total: snapshot.size,
    byType: {},
    byStatus: {},
    withInstallments: 0,
    withAuditTrail: 0
  };

  // 統計各項資料
  for (const doc of snapshot.docs) {
    const data = doc.data();

    // 統計類型
    const typeLabel = SubsidyTypeLabels[data.type] || `未知(${data.type})`;
    stats.byType[typeLabel] = (stats.byType[typeLabel] || 0) + 1;

    // 統計狀態
    const statusLabel = SubsidyStatusLabels[data.status] || `未知(${data.status})`;
    stats.byStatus[statusLabel] = (stats.byStatus[statusLabel] || 0) + 1;

    // 檢查筆電補助是否有分期子集合
    if (data.type === 1) {
      const installmentsSnapshot = await doc.ref.collection('installments').get();
      if (!installmentsSnapshot.empty) {
        stats.withInstallments++;
      }
    }

    // 檢查是否有稽核軌跡
    const auditTrailSnapshot = await doc.ref.collection('auditTrail').get();
    if (!auditTrailSnapshot.empty) {
      stats.withAuditTrail++;
    }
  }

  // 顯示結果
  console.log(`📊 總筆數: ${stats.total}\n`);

  console.log('補助類型分布:');
  Object.entries(stats.byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count} 筆`);
  });

  console.log('\n補助狀態分布:');
  Object.entries(stats.byStatus).forEach(([status, count]) => {
    console.log(`  ${status}: ${count} 筆`);
  });

  console.log(`\n筆電補助含分期記錄: ${stats.withInstallments} 筆`);
  console.log(`含稽核軌跡: ${stats.withAuditTrail} 筆`);

  return stats;
}

/**
 * 驗證 mealSubsidies 集合
 */
async function verifyMealSubsidies() {
  console.log('\n============================================================');
  console.log('驗證 mealSubsidies 集合');
  console.log('============================================================\n');

  const snapshot = await db.collection('mealSubsidies').get();

  let totalMealCount = 0;
  let totalAmount = 0;
  const userSet = new Set();

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.meals && Array.isArray(data.meals)) {
      totalMealCount += data.meals.length;
      data.meals.forEach(meal => {
        totalAmount += meal.amount || 0;
        if (meal.userId) {
          userSet.add(meal.userId);
        }
      });
    }
  });

  console.log(`📊 日期記錄數: ${snapshot.size} 天`);
  console.log(`總用餐次數: ${totalMealCount} 次`);
  console.log(`總餐費金額: NT$ ${totalAmount.toLocaleString()}`);
  console.log(`參與員工數: ${userSet.size} 人`);

  return {
    dateCount: snapshot.size,
    mealCount: totalMealCount,
    totalAmount,
    userCount: userSet.size
  };
}

/**
 * 驗證 userMealStats 集合
 */
async function verifyUserMealStats() {
  console.log('\n============================================================');
  console.log('驗證 userMealStats 集合');
  console.log('============================================================\n');

  const snapshot = await db.collection('userMealStats').get();

  let totalAmount = 0;
  let totalMealCount = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    totalAmount += data.totalAmount || 0;
    totalMealCount += data.mealCount || 0;
  });

  console.log(`📊 使用者月度統計數: ${snapshot.size} 筆`);
  console.log(`統計總餐費: NT$ ${totalAmount.toLocaleString()}`);
  console.log(`統計總次數: ${totalMealCount} 次`);

  return {
    statsCount: snapshot.size,
    totalAmount,
    totalMealCount
  };
}

/**
 * 抽樣檢查資料品質
 */
async function sampleDataCheck() {
  console.log('\n============================================================');
  console.log('抽樣檢查資料品質');
  console.log('============================================================\n');

  // 檢查補助申請
  const subsidySnapshot = await db.collection('subsidyApplications').limit(5).get();

  console.log('補助申請範例（前 5 筆）:');
  subsidySnapshot.forEach((doc, index) => {
    const data = doc.data();
    const typeLabel = SubsidyTypeLabels[data.type];
    const statusLabel = SubsidyStatusLabels[data.status];
    const amount = data.approvedAmount ? `NT$ ${data.approvedAmount.toLocaleString()}` : '無';

    console.log(`  ${index + 1}. [${typeLabel}] ${statusLabel} - ${amount}`);
  });

  // 檢查餐點記錄
  const mealSnapshot = await db.collection('mealSubsidies').limit(3).get();

  if (!mealSnapshot.empty) {
    console.log('\n餐點記錄範例（前 3 天）:');
    mealSnapshot.forEach((doc, index) => {
      const data = doc.data();
      const mealCount = data.meals ? data.meals.length : 0;
      const dailyTotal = data.dailyTotal || 0;

      console.log(`  ${index + 1}. ${doc.id}: ${mealCount} 份餐點, NT$ ${dailyTotal.toLocaleString()}`);
    });
  }
}

/**
 * 主程式
 */
async function main() {
  console.log('開始驗證遷移資料...\n');

  try {
    await verifySubsidyApplications();
    await verifyMealSubsidies();
    await verifyUserMealStats();
    await sampleDataCheck();

    console.log('\n============================================================');
    console.log('✓ 驗證完成');
    console.log('============================================================\n');
  } catch (error) {
    console.error('\n✗ 驗證失敗:', error);
    throw error;
  }
}

// 執行驗證
if (require.main === module) {
  main()
    .then(() => {
      console.log('✓ 驗證作業完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ 驗證作業失敗:', error);
      process.exit(1);
    });
}

module.exports = { verifySubsidyApplications, verifyMealSubsidies, verifyUserMealStats };
