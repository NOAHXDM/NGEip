/**
 * 午餐訂購紀錄解析器
 * 讀取所有分頁的訂購紀錄，整理成 JSON Array
 */

const XLSX = require('xlsx');
const fs = require('fs');

/**
 * Excel 日期數值轉換為 JavaScript Date
 * @param {number} excelDate - Excel 日期數值
 * @returns {Date}
 */
function excelDateToJSDate(excelDate) {
  const baseDate = new Date(1899, 11, 30);
  const days = Math.floor(excelDate);
  const result = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  return result;
}

/**
 * 格式化日期為 YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 解析單一工作表的訂購紀錄
 * @param {Object} worksheet - Excel 工作表
 * @param {string} sheetName - 工作表名稱
 * @returns {Array} 訂購紀錄陣列
 */
function parseWorksheet(worksheet, sheetName) {
  // 轉換成二維陣列
  const data = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    blankrows: false
  });

  if (data.length < 3) {
    console.log(`  ⚠ 工作表「${sheetName}」資料不足，跳過`);
    return [];
  }

  // 第一列：日期
  const dateRow = data[0];
  // 第二列：店家名稱和「餐費」標籤
  const restaurantRow = data[1];
  // 第三列開始：訂餐資料
  const orderRows = data.slice(2);

  // 識別日期和店家的欄位結構
  const dateColumns = [];
  for (let col = 0; col < dateRow.length; col++) {
    const dateValue = dateRow[col];
    if (dateValue && typeof dateValue === 'number' && dateValue > 40000) {
      // Excel 日期通常是大於 40000 的數字
      const date = excelDateToJSDate(dateValue);
      const restaurant = restaurantRow[col] || '未命名店家';

      dateColumns.push({
        col,
        date: formatDate(date),
        dateObj: date,
        restaurant: String(restaurant).trim(),
        nameCol: col - 1,      // 員工名稱欄位
        mealCol: col,          // 餐點名稱欄位
        priceCol: col + 1      // 價格欄位
      });
    }
  }

  // 提取訂餐記錄
  const orders = [];

  for (const row of orderRows) {
    const firstCell = row[0];

    // 跳過統計列
    if (firstCell && typeof firstCell === 'string') {
      const cellStr = String(firstCell).trim();
      if (cellStr === '預估金額' || cellStr === '實際金額' ||
          cellStr === '個人承擔' || cellStr === '公司承擔') {
        continue;
      }
    }

    for (const dc of dateColumns) {
      const userName = row[dc.nameCol];
      const mealName = row[dc.mealCol];
      const price = row[dc.priceCol];

      // 只記錄有餐點名稱的訂單（排除 null、p、pass、怕死等）
      if (mealName && String(mealName).trim()) {
        const mealStr = String(mealName).trim().toLowerCase();
        if (!['null', 'p', 'pass', '怕死'].includes(mealStr)) {
          const order = {
            sheetName,
            date: dc.date,
            restaurant: dc.restaurant,
            userName: userName ? String(userName).trim() : null,
            mealName: String(mealName).trim(),
            price: typeof price === 'number' ? price : null
          };

          orders.push(order);
        }
      }
    }
  }

  return orders;
}

/**
 * 解析整個 Excel 檔案的所有分頁
 * @param {string} excelFilePath - Excel 檔案路徑
 * @returns {Object} 解析結果
 */
function parseLunchOrders(excelFilePath) {
  const workbook = XLSX.readFile(excelFilePath);

  console.log(`\n📋 找到 ${workbook.SheetNames.length} 個工作表：`);
  workbook.SheetNames.forEach((name, idx) => {
    console.log(`  ${idx + 1}. ${name}`);
  });

  let allOrders = [];

  // 逐一解析每個工作表
  for (const sheetName of workbook.SheetNames) {
    console.log(`\n🔍 正在解析工作表：${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];
    const orders = parseWorksheet(worksheet, sheetName);

    console.log(`  ✓ 找到 ${orders.length} 筆訂購紀錄`);
    allOrders = allOrders.concat(orders);
  }

  // 統計資訊
  const stats = {
    totalSheets: workbook.SheetNames.length,
    totalOrders: allOrders.length,
    uniqueUsers: [...new Set(allOrders.map(o => o.userName).filter(n => n))].length,
    uniqueDates: [...new Set(allOrders.map(o => o.date))].sort(),
    uniqueRestaurants: [...new Set(allOrders.map(o => o.restaurant))],
    totalAmount: allOrders.reduce((sum, o) => sum + (o.price || 0), 0),
    sheetNames: workbook.SheetNames
  };

  return {
    stats,
    orders: allOrders
  };
}

/**
 * 主程式
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('使用方式：');
    console.log('  node tools/lunch-order-parser.js <excel檔案路徑> [輸出JSON檔案路徑]');
    console.log('');
    console.log('範例：');
    console.log('  node tools/lunch-order-parser.js docs/plans/001-subsidy-application/午餐訂購紀錄.xlsx');
    console.log('  node tools/lunch-order-parser.js docs/plans/001-subsidy-application/午餐訂購紀錄.xlsx lunch-orders.json');
    process.exit(1);
  }

  const excelFilePath = args[0];
  const outputFilePath = args[1];

  if (!fs.existsSync(excelFilePath)) {
    console.error(`❌ 錯誤：找不到檔案 ${excelFilePath}`);
    process.exit(1);
  }

  try {
    console.log(`\n📂 正在讀取：${excelFilePath}`);
    const result = parseLunchOrders(excelFilePath);

    // 顯示統計資訊
    console.log('\n' + '='.repeat(60));
    console.log('📊 統計資訊');
    console.log('='.repeat(60));
    console.log(`工作表數量：${result.stats.totalSheets}`);
    console.log(`訂單總數：${result.stats.totalOrders}`);
    console.log(`訂餐人數：${result.stats.uniqueUsers}`);
    console.log(`訂餐日期：${result.stats.uniqueDates.length} 天 (${result.stats.uniqueDates[0]} ~ ${result.stats.uniqueDates[result.stats.uniqueDates.length - 1]})`);
    console.log(`餐廳列表：${result.stats.uniqueRestaurants.join(', ')}`);
    console.log(`總金額：NT$ ${result.stats.totalAmount.toLocaleString()}`);

    // 顯示前 10 筆訂單範例
    console.log('\n' + '='.repeat(60));
    console.log('📝 訂單範例（前 10 筆）');
    console.log('='.repeat(60));
    result.orders.slice(0, 10).forEach((order, idx) => {
      console.log(`${String(idx + 1).padStart(2, ' ')}. [${order.date}] ${order.userName || '無名氏'} | ${order.restaurant} | ${order.mealName} | NT$ ${order.price || 'N/A'}`);
    });

    // 輸出到檔案或顯示
    if (outputFilePath) {
      fs.writeFileSync(
        outputFilePath,
        JSON.stringify(result.orders, null, 2),
        'utf8'
      );
      console.log(`\n✅ 已成功將 ${result.orders.length} 筆資料寫入：${outputFilePath}`);
      console.log(`\n💡 提示：您也可以查看包含統計資訊的完整輸出：`);
      console.log(`   node tools/lunch-order-parser.js "${excelFilePath}" | grep -A 1000 "完整 JSON"`);
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('📄 完整 JSON 輸出（僅顯示訂單陣列）');
      console.log('='.repeat(60));
      console.log(JSON.stringify(result.orders, null, 2));
    }

  } catch (error) {
    console.error('\n❌ 解析過程發生錯誤：', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 執行主程式
if (require.main === module) {
  main();
}

// 匯出函式
module.exports = {
  parseLunchOrders,
  parseWorksheet,
  excelDateToJSDate,
  formatDate
};
