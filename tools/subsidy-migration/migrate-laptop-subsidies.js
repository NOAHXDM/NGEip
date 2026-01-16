/**
 * 個人筆電補助遷移腳本
 *
 * 用途：將個人筆電補助資料從 JSON 遷移到 Firestore
 *
 * 使用方式：
 * node migrate-laptop-subsidies.js <json檔案路徑>
 *
 * 範例：
 * # 本地模擬器（預設）
 * node migrate-laptop-subsidies.js ./laptop-subsidies.json
 *
 * # 正式環境（需要 serviceAccountKey.json）
 * USE_PRODUCTION=true node migrate-laptop-subsidies.js ./laptop-subsidies.json
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
 * 建立補助申請記錄（包含分期資訊）
 */
async function createLaptopSubsidyApplication(employee, userId) {
  const applicationDate = parseTimestamp(employee.applicationDate);

  // 計算核准金額：發票金額的 80%，但最多不超過 54000
  let approvedAmount = null;
  if (employee.invoiceAmount !== null) {
    const calculatedAmount = employee.invoiceAmount * 0.8;
    approvedAmount = Math.min(calculatedAmount, 54000);
  }

  // 建立 notes 內容
  const notesLines = [];
  if (employee.invoiceAmount !== null) {
    notesLines.push(`發票金額: NT$ ${employee.invoiceAmount.toLocaleString()}`);
    notesLines.push(`核准金額: NT$ ${approvedAmount.toLocaleString()} (發票金額 80%)`);
  } else {
    notesLines.push(`發票金額: 無`);
  }
  notesLines.push(`分期數: ${employee.installmentCount} 期`);
  notesLines.push(`月付總計: NT$ ${employee.totalMonthlyAmount.toLocaleString()}`);

  // 建立補助申請文件
  const applicationData = {
    userId,
    type: SubsidyType.Laptop,
    status: SubsidyStatus.Approved, // 歷史資料預設為已核准
    applicationDate,
    approvedAmount, // 發票金額的 80%，最多不超過 54000
    content: '個人筆電',
    notes: notesLines.join(' | '),
    invoiceAmount: employee.invoiceAmount, // 發票金額（可能為 null）
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now()
  };

  // 新增到 subsidyApplications 集合
  const applicationRef = await db.collection('subsidyApplications').add(applicationData);

  // 建立分期資訊子集合
  const installmentsCollection = applicationRef.collection('installments');
  for (const inst of employee.installments) {
    await installmentsCollection.add({
      installmentNumber: inst.period,
      receivedDate: parseTimestamp(inst.paymentDate),
      amount: inst.amount,
      createdAt: admin.firestore.Timestamp.now()
    });
  }

  // 建立稽核軌跡
  await applicationRef.collection('auditTrail').add({
    action: 'create',
    actionBy: 'system',
    actionDateTime: admin.firestore.Timestamp.now(),
    content: JSON.stringify({
      source: 'migration',
      originalData: employee
    })
  });

  return applicationRef.id;
}

/**
 * 遷移個人筆電補助資料
 */
async function migrateLaptopSubsidies(jsonFilePath) {
  console.log(`\n開始遷移個人筆電補助資料...`);
  console.log(`JSON 檔案: ${jsonFilePath}\n`);

  // 讀取 JSON 檔案
  if (!fs.existsSync(jsonFilePath)) {
    throw new Error(`找不到檔案: ${jsonFilePath}`);
  }

  const employees = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

  if (!Array.isArray(employees) || employees.length === 0) {
    throw new Error(`JSON 檔案格式錯誤或資料為空`);
  }

  console.log(`找到 ${employees.length} 筆員工補助資料\n`);

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const errors = [];
  const userCache = {}; // 快取使用者 ID

  for (const employee of employees) {
    try {
      const { userName, applicationDate, installmentCount, totalMonthlyAmount, invoiceAmount } = employee;

      // 驗證必要欄位
      if (!userName || !applicationDate || !installmentCount || installmentCount === 0) {
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
      const applicationId = await createLaptopSubsidyApplication(employee, userId);

      const invoiceStr = invoiceAmount !== null
        ? `發票 NT$ ${invoiceAmount.toLocaleString()}`
        : '無發票';

      console.log(`✓ ${userName} | ${installmentCount} 期 | 月付 NT$ ${totalMonthlyAmount.toLocaleString()} | ${invoiceStr} → ${applicationId}`);
      successCount++;

    } catch (error) {
      console.error(`✗ 失敗: ${employee.userName} - ${error.message}`);
      failCount++;
      errors.push({
        employee,
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
  console.log(`總計處理: ${employees.length} 筆`);

  if (errors.length > 0) {
    console.log(`\n錯誤詳情:`);
    errors.forEach(({ employee, error }) => {
      console.log(`  - ${employee.userName}: ${error}`);
    });
  }

  // 統計資訊
  console.log(`\n📊 補助統計:`);
  const totalMonthlyAmount = employees.reduce((sum, e) => sum + e.totalMonthlyAmount, 0);
  const totalInvoiceAmount = employees
    .filter(e => e.invoiceAmount !== null)
    .reduce((sum, e) => sum + e.invoiceAmount, 0);
  const totalInstallments = employees.reduce((sum, e) => sum + e.installmentCount, 0);

  console.log(`  月付總額: NT$ ${totalMonthlyAmount.toLocaleString()}`);
  console.log(`  發票總額: NT$ ${totalInvoiceAmount.toLocaleString()}`);
  console.log(`  總分期數: ${totalInstallments} 期`);
}

// 主程式
if (require.main === module) {
  if (process.argv.length < 3) {
    console.error('使用方式: node migrate-laptop-subsidies.js <json檔案路徑>');
    console.error('範例: node migrate-laptop-subsidies.js ./laptop-subsidies.json');
    process.exit(1);
  }

  const jsonFilePath = path.resolve(process.argv[2]);

  migrateLaptopSubsidies(jsonFilePath)
    .then(() => {
      console.log('\n✓ 個人筆電補助資料遷移完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ 遷移失敗:', error);
      process.exit(1);
    });
}

module.exports = { migrateLaptopSubsidies };
