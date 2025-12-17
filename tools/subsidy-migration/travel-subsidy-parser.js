/**
 * 旅遊補助解析器
 * 讀取旅遊補助 JSON 資料，解析並清理資料
 */

const fs = require('fs');

/**
 * 解析日期字串 (支援 M/D/YY 格式)
 * @param {string} dateStr - 日期字串，例如 "12/24/25" 或 "4/1/24"
 * @returns {Date|null}
 */
function parseDate(dateStr) {
  if (!dateStr || dateStr === 'null') return null;

  // 移除空白
  dateStr = String(dateStr).trim();

  // 解析 M/D/YY 或 MM/DD/YY 格式
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (match) {
    const [, month, day, year] = match;

    // 判斷年份（假設 00-49 為 2000-2049，50-99 為 1950-1999）
    const fullYear = parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year);

    return new Date(fullYear, parseInt(month) - 1, parseInt(day));
  }

  console.warn(`  ⚠ 無法解析日期: ${dateStr}`);
  return null;
}

/**
 * 格式化日期為 YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  if (!date) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 解析金額（從字串轉為數字）
 * @param {string|number} amount
 * @returns {number|null}
 */
function parseAmount(amount) {
  if (amount === null || amount === undefined || amount === 'null') return null;

  const parsed = typeof amount === 'number' ? amount : parseFloat(amount);
  return isNaN(parsed) ? null : parsed;
}

/**
 * 判斷旅遊類型
 * @param {string} content
 * @returns {string}
 */
function getTravelType(content) {
  if (!content) return '未分類';

  const contentStr = String(content).trim();

  if (contentStr.includes('員旅')) {
    return '員工旅遊';
  } else if (contentStr.includes('個人')) {
    return '個人旅遊';
  }

  return '其他';
}

/**
 * 解析旅遊補助資料
 * @param {string} jsonFilePath - JSON 檔案路徑
 * @returns {Object} 解析結果
 */
function parseTravelSubsidies(jsonFilePath) {
  console.log(`\n📂 正在讀取：${jsonFilePath}`);

  if (!fs.existsSync(jsonFilePath)) {
    throw new Error(`找不到檔案: ${jsonFilePath}`);
  }

  const rawData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
  const records = rawData['旅遊補助'] || rawData;

  if (!Array.isArray(records)) {
    throw new Error('JSON 格式錯誤：應為陣列或包含「旅遊補助」鍵的物件');
  }

  console.log(`\n找到 ${records.length} 筆原始資料\n`);

  const parsedRecords = [];
  let skippedCount = 0;

  for (const record of records) {
    const { 姓名: userName, 日期: dateStr, 金額: amountStr, 內容: content } = record;

    // 跳過無效記錄（日期或金額為 null）
    if (!dateStr || !amountStr || !content) {
      skippedCount++;
      continue;
    }

    // 解析日期
    const date = parseDate(dateStr);
    if (!date) {
      console.warn(`  ⚠ 跳過無效日期: ${userName} - ${dateStr}`);
      skippedCount++;
      continue;
    }

    // 解析金額
    const amount = parseAmount(amountStr);
    if (amount === null || amount === 0) {
      console.warn(`  ⚠ 跳過無效金額: ${userName} - ${amountStr}`);
      skippedCount++;
      continue;
    }

    // 判斷旅遊類型
    const travelType = getTravelType(content);

    parsedRecords.push({
      userName: userName ? String(userName).trim() : null,
      applicationDate: formatDate(date),
      amount,
      content: content ? String(content).trim() : '',
      travelType,
      originalDateStr: dateStr,
      originalAmountStr: amountStr
    });
  }

  // 計算統計資訊
  const stats = {
    totalRecords: records.length,
    validRecords: parsedRecords.length,
    skippedRecords: skippedCount,
    uniqueUsers: [...new Set(parsedRecords.map(r => r.userName).filter(n => n))].length,
    dateRange: {
      earliest: parsedRecords.length > 0
        ? parsedRecords.map(r => r.applicationDate).sort()[0]
        : null,
      latest: parsedRecords.length > 0
        ? parsedRecords.map(r => r.applicationDate).sort().reverse()[0]
        : null
    },
    totalAmount: parsedRecords.reduce((sum, r) => sum + r.amount, 0),
    byType: {}
  };

  // 按類型統計
  parsedRecords.forEach(r => {
    if (!stats.byType[r.travelType]) {
      stats.byType[r.travelType] = {
        count: 0,
        totalAmount: 0
      };
    }
    stats.byType[r.travelType].count++;
    stats.byType[r.travelType].totalAmount += r.amount;
  });

  return {
    stats,
    records: parsedRecords
  };
}

/**
 * 主程式
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('使用方式：');
    console.log('  node travel-subsidy-parser.js <json檔案路徑> [輸出檔案路徑]');
    console.log('');
    console.log('範例：');
    console.log('  node travel-subsidy-parser.js 旅遊補助.json');
    console.log('  node travel-subsidy-parser.js 旅遊補助.json travel-subsidies.json');
    process.exit(1);
  }

  const jsonFilePath = args[0];
  const outputFilePath = args[1];

  try {
    const result = parseTravelSubsidies(jsonFilePath);

    // 顯示統計資訊
    console.log('='.repeat(60));
    console.log('📊 統計資訊');
    console.log('='.repeat(60));
    console.log(`原始資料數：${result.stats.totalRecords}`);
    console.log(`有效記錄數：${result.stats.validRecords}`);
    console.log(`跳過記錄數：${result.stats.skippedRecords}`);
    console.log(`申請人數：${result.stats.uniqueUsers}`);
    console.log(`日期範圍：${result.stats.dateRange.earliest} ~ ${result.stats.dateRange.latest}`);
    console.log(`總補助金額：NT$ ${result.stats.totalAmount.toLocaleString()}`);

    console.log('\n📋 依類型統計：');
    Object.entries(result.stats.byType).forEach(([type, data]) => {
      console.log(`  ${type}: ${data.count} 筆, NT$ ${data.totalAmount.toLocaleString()}`);
    });

    // 顯示範例
    console.log('\n' + '='.repeat(60));
    console.log('📝 資料範例（前 10 筆）');
    console.log('='.repeat(60));
    result.records.slice(0, 10).forEach((record, idx) => {
      console.log(`${String(idx + 1).padStart(2, ' ')}. [${record.applicationDate}] ${record.userName} | ${record.travelType} | ${record.content} | NT$ ${record.amount.toLocaleString()}`);
    });

    // 輸出到檔案或顯示
    if (outputFilePath) {
      fs.writeFileSync(
        outputFilePath,
        JSON.stringify(result.records, null, 2),
        'utf8'
      );
      console.log(`\n✅ 已成功將 ${result.records.length} 筆資料寫入：${outputFilePath}`);
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('📄 完整 JSON 輸出');
      console.log('='.repeat(60));
      console.log(JSON.stringify(result.records, null, 2));
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
  parseTravelSubsidies,
  parseDate,
  formatDate,
  parseAmount,
  getTravelType
};
