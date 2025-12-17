/**
 * 午餐訂購紀錄遷移腳本
 *
 * 用途：將午餐訂購紀錄從 JSON 遷移到 Firestore
 *
 * 使用方式：
 * node migrate-lunch-orders.js <json檔案路徑>
 *
 * 範例：
 * node migrate-lunch-orders.js ./lunch-orders.json
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

// 金額上限設定
const MAX_SUBSIDY_AMOUNT = 150;

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
 * 解析日期字串 (支援 YYYY-MM-DD 格式)
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // 移除空白
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
 * 處理金額：確保不超過上限
 */
function processAmount(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return MAX_SUBSIDY_AMOUNT;
  }

  // 如果金額超過上限，則使用上限
  return Math.min(amount, MAX_SUBSIDY_AMOUNT);
}

/**
 * 格式化日期為 YYYY-MM-DD
 */
function formatDateId(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化月份為 YYYY-MM
 */
function formatYearMonth(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * 取得星期幾 (1-7, 週一到週日)
 */
function getDayOfWeek(date) {
  const day = date.getDay();
  return day === 0 ? 7 : day; // 將週日從 0 改為 7
}

/**
 * 將訂單資料依日期分組
 */
function groupByDate(orders) {
  const dailyRecords = {};

  orders.forEach(order => {
    const { date, userName, mealName, restaurant, price } = order;

    if (!date || !userName) {
      return; // 跳過無效資料
    }

    const dateObj = parseDate(date);
    if (!dateObj) {
      console.warn(`  警告: 無效日期 ${date}，跳過`);
      return;
    }

    const dateId = formatDateId(dateObj);

    if (!dailyRecords[dateId]) {
      dailyRecords[dateId] = {
        date: dateObj,
        meals: []
      };
    }

    // 處理金額：超過 150 則設為 150
    const amount = processAmount(price);
    const orderContent = `${restaurant} - ${mealName}`;

    dailyRecords[dateId].meals.push({
      userName,
      orderContent,
      originalAmount: price,
      amount
    });
  });

  return dailyRecords;
}

/**
 * 遷移午餐訂購紀錄
 */
async function migrateLunchOrders(jsonFilePath) {
  console.log(`\n開始遷移午餐訂購紀錄...`);
  console.log(`JSON 檔案: ${jsonFilePath}\n`);

  // 讀取 JSON 檔案
  if (!fs.existsSync(jsonFilePath)) {
    throw new Error(`找不到檔案: ${jsonFilePath}`);
  }

  const orders = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

  if (!Array.isArray(orders) || orders.length === 0) {
    throw new Error(`JSON 檔案格式錯誤或資料為空`);
  }

  console.log(`找到 ${orders.length} 筆訂單資料\n`);

  // 將資料依日期分組
  const dailyRecords = groupByDate(orders);
  const dateIds = Object.keys(dailyRecords).sort();

  console.log(`共 ${dateIds.length} 個用餐日期\n`);

  let successCount = 0;
  let failCount = 0;
  let cappedCount = 0; // 被上限限制的數量
  const errors = [];
  const userCache = {}; // 快取使用者 ID

  // 處理每日資料
  for (const dateId of dateIds) {
    try {
      const { date, meals } = dailyRecords[dateId];
      console.log(`處理日期: ${dateId} (${meals.length} 筆餐點)`);

      // 建立 MealEntry 陣列並查詢 userId
      const mealEntries = [];
      const userIds = [];

      for (const meal of meals) {
        // 使用快取避免重複查詢
        let userId = userCache[meal.userName];

        if (!userId) {
          userId = await getUserIdByName(meal.userName);
          if (userId) {
            userCache[meal.userName] = userId;
          }
        }

        if (!userId) {
          console.warn(`  ⚠ 找不到使用者 ${meal.userName}，跳過`);
          continue;
        }

        // 檢查金額是否被限制
        if (meal.originalAmount > MAX_SUBSIDY_AMOUNT) {
          console.log(`  💰 ${meal.userName}: $${meal.originalAmount} → $${meal.amount} (已限制)`);
          cappedCount++;
        }

        mealEntries.push({
          userId,
          orderContent: meal.orderContent,
          amount: meal.amount
        });

        if (!userIds.includes(userId)) {
          userIds.push(userId);
        }
      }

      if (mealEntries.length === 0) {
        console.warn(`  ⚠ ${dateId} 沒有有效的餐點記錄，跳過`);
        continue;
      }

      // 計算每日總額
      const dailyTotal = mealEntries.reduce((sum, entry) => sum + entry.amount, 0);

      // 使用交易建立每日記錄和更新月度統計
      await db.runTransaction(async (transaction) => {
        // 步驟 1：先完成所有讀取操作
        const statsReads = [];
        for (const entry of mealEntries) {
          const yearMonth = formatYearMonth(date);
          const statsId = `${entry.userId}_${yearMonth}`;
          const statsRef = db.collection('userMealStats').doc(statsId);
          statsReads.push({
            userId: entry.userId,
            amount: entry.amount,
            statsRef,
            statsDoc: await transaction.get(statsRef)
          });
        }

        // 步驟 2：執行所有寫入操作
        // 建立每日餐點記錄
        const dailyRef = db.collection('mealSubsidies').doc(dateId);
        transaction.set(dailyRef, {
          date: admin.firestore.Timestamp.fromDate(date),
          dayOfWeek: getDayOfWeek(date),
          meals: mealEntries,
          dailyTotal,
          userIds,
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now()
        });

        // 更新每個使用者的月度統計
        for (const read of statsReads) {
          const yearMonth = formatYearMonth(date);
          const dateIdStr = formatDateId(date);

          if (read.statsDoc.exists) {
            // 更新現有統計
            const stats = read.statsDoc.data();
            const existingDetail = stats.details.find(d => d.date === dateIdStr);

            if (!existingDetail) {
              transaction.update(read.statsRef, {
                totalAmount: admin.firestore.FieldValue.increment(read.amount),
                mealCount: admin.firestore.FieldValue.increment(1),
                details: admin.firestore.FieldValue.arrayUnion({
                  date: dateIdStr,
                  amount: read.amount
                }),
                updatedAt: admin.firestore.Timestamp.now()
              });
            }
          } else {
            // 建立新的月度統計
            transaction.set(read.statsRef, {
              userId: read.userId,
              yearMonth,
              totalAmount: read.amount,
              mealCount: 1,
              details: [{
                date: dateIdStr,
                amount: read.amount
              }],
              updatedAt: admin.firestore.Timestamp.now()
            });
          }
        }
      });

      console.log(`  ✓ 成功: ${dateId} - ${mealEntries.length} 筆餐點, 總計 $${dailyTotal}`);
      successCount++;

    } catch (error) {
      console.error(`  ✗ 失敗: ${dateId} - ${error.message}`);
      failCount++;
      errors.push({
        dateId,
        error: error.message
      });
    }
  }

  // 輸出結果
  console.log(`\n============================================================`);
  console.log(`遷移完成！`);
  console.log(`============================================================`);
  console.log(`✓ 成功: ${successCount} 個日期`);
  console.log(`✗ 失敗: ${failCount} 個日期`);
  console.log(`💰 金額被限制: ${cappedCount} 筆 (超過 $${MAX_SUBSIDY_AMOUNT})`);

  if (errors.length > 0) {
    console.log(`\n錯誤詳情:`);
    errors.forEach(({ dateId, error }) => {
      console.log(`  - ${dateId}: ${error}`);
    });
  }
}

// 主程式
if (require.main === module) {
  if (process.argv.length < 3) {
    console.error('使用方式: node migrate-lunch-orders.js <json檔案路徑>');
    console.error('範例: node migrate-lunch-orders.js ./lunch-orders.json');
    process.exit(1);
  }

  const jsonFilePath = path.resolve(process.argv[2]);

  migrateLunchOrders(jsonFilePath)
    .then(() => {
      console.log('\n✓ 午餐訂購紀錄遷移完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ 遷移失敗:', error);
      process.exit(1);
    });
}

module.exports = { migrateLunchOrders };
