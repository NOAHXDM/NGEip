/**
 * 進修課程解析器
 * 讀取進修課程 Excel 資料，整理成 JSON Array
 */

const XLSX = require('xlsx');
const fs = require('fs');

/**
 * 解析日期字串
 * 支援多種格式：
 * - "2023/11/08"
 * - "11/10/23"
 * - "9/1/20"
 * @param {string} dateStr - 日期字串
 * @returns {Date|null}
 */
function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  dateStr = dateStr.trim();

  // 格式 1: YYYY/MM/DD
  let match = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // 格式 2: M/D/YY 或 MM/DD/YY
  match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (match) {
    const [, month, day, year] = match;
    // 假設 20-99 為 1920-1999，00-19 為 2000-2019，20+ 為 2020+
    const fullYear = parseInt(year) >= 20 ? 2000 + parseInt(year) : 2000 + parseInt(year);
    return new Date(fullYear, parseInt(month) - 1, parseInt(day));
  }

  return null;
}

/**
 * 格式化日期為 YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 解析數字字串
 * @param {string|number} value
 * @returns {number|null}
 */
function parseNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  const num = parseFloat(String(value).trim());
  return isNaN(num) ? null : num;
}

/**
 * 解析進修課程資料
 * @param {string} jsonFilePath - JSON 檔案路徑
 * @returns {Object} 解析結果
 */
function parseTrainingCourses(jsonFilePath) {
  const rawData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
  const records = rawData['進修課程'] || [];

  console.log(`\n📋 找到 ${records.length} 筆原始資料`);

  const courses = [];
  let currentUserName = null; // 記錄當前使用者名稱（用於姓名為 null 的情況）

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // 更新當前使用者名稱
    if (record['姓名']) {
      currentUserName = String(record['姓名']).trim();
    }

    // 跳過無效記錄（沒有課程名稱）
    if (!record['課程名稱']) {
      continue;
    }

    // 跳過申請金額為 0 或 null 的記錄
    const appliedAmount = parseNumber(record['申請金額']);
    if (!appliedAmount || appliedAmount === 0) {
      continue;
    }

    // 解析日期
    const applicationDate = parseDate(record['申請日期']);
    const issuanceDate = parseDate(record['核發日期']);

    if (!applicationDate) {
      console.warn(`  ⚠ 第 ${i + 1} 筆：申請日期格式錯誤 "${record['申請日期']}"，跳過`);
      continue;
    }

    // 解析金額
    const invoiceAmount = parseNumber(record['發票金額']);
    const travelExpense = parseNumber(record['車馬費']);
    const accommodation = parseNumber(record['住宿']);

    // 計算總費用
    const totalExpense = (invoiceAmount || 0) + (travelExpense || 0) + (accommodation || 0);

    const course = {
      userName: currentUserName,
      applicationDate: formatDate(applicationDate),
      courseName: String(record['課程名稱']).trim(),
      invoiceAmount,
      travelExpense,
      accommodation,
      totalExpense,
      appliedAmount,
      issuanceDate: formatDate(issuanceDate)
    };

    courses.push(course);
  }

  // 統計資訊
  const stats = {
    totalRecords: records.length,
    validCourses: courses.length,
    uniqueUsers: [...new Set(courses.map(c => c.userName).filter(n => n))].length,
    dateRange: {
      earliest: courses.reduce((min, c) => !min || c.applicationDate < min ? c.applicationDate : min, null),
      latest: courses.reduce((max, c) => !max || c.applicationDate > max ? c.applicationDate : max, null)
    },
    totalAppliedAmount: courses.reduce((sum, c) => sum + (c.appliedAmount || 0), 0),
    totalExpense: courses.reduce((sum, c) => sum + (c.totalExpense || 0), 0),
    uniqueCourses: [...new Set(courses.map(c => c.courseName))].length
  };

  return {
    stats,
    courses
  };
}

/**
 * 主程式
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('使用方式：');
    console.log('  node training-course-parser.js <json檔案路徑> [輸出JSON檔案路徑]');
    console.log('');
    console.log('範例：');
    console.log('  node training-course-parser.js 進修課程.json');
    console.log('  node training-course-parser.js 進修課程.json training-courses.json');
    process.exit(1);
  }

  const jsonFilePath = args[0];
  const outputFilePath = args[1];

  if (!fs.existsSync(jsonFilePath)) {
    console.error(`❌ 錯誤：找不到檔案 ${jsonFilePath}`);
    process.exit(1);
  }

  try {
    console.log(`\n📂 正在讀取：${jsonFilePath}`);
    const result = parseTrainingCourses(jsonFilePath);

    // 顯示統計資訊
    console.log('\n' + '='.repeat(60));
    console.log('📊 統計資訊');
    console.log('='.repeat(60));
    console.log(`原始資料數：${result.stats.totalRecords}`);
    console.log(`有效課程數：${result.stats.validCourses}`);
    console.log(`申請人數：${result.stats.uniqueUsers}`);
    console.log(`課程種類：${result.stats.uniqueCourses}`);
    console.log(`日期範圍：${result.stats.dateRange.earliest} ~ ${result.stats.dateRange.latest}`);
    console.log(`申請總額：NT$ ${result.stats.totalAppliedAmount.toLocaleString()}`);
    console.log(`實際總費用：NT$ ${result.stats.totalExpense.toLocaleString()}`);

    // 顯示前 10 筆課程範例
    console.log('\n' + '='.repeat(60));
    console.log('📝 課程範例（前 10 筆）');
    console.log('='.repeat(60));
    result.courses.slice(0, 10).forEach((course, idx) => {
      console.log(`${String(idx + 1).padStart(2, ' ')}. [${course.applicationDate}] ${course.userName || '無名氏'}`);
      console.log(`    課程：${course.courseName}`);
      console.log(`    費用：發票 $${course.invoiceAmount || 0} + 車馬費 $${course.travelExpense || 0} + 住宿 $${course.accommodation || 0} = $${course.totalExpense}`);
      console.log(`    申請金額：NT$ ${course.appliedAmount}`);
    });

    // 依使用者分組統計
    const userStats = {};
    result.courses.forEach(course => {
      if (!course.userName) return;

      if (!userStats[course.userName]) {
        userStats[course.userName] = {
          courseCount: 0,
          totalApplied: 0
        };
      }

      userStats[course.userName].courseCount++;
      userStats[course.userName].totalApplied += course.appliedAmount;
    });

    console.log('\n' + '='.repeat(60));
    console.log('👥 各使用者統計');
    console.log('='.repeat(60));
    Object.entries(userStats)
      .sort((a, b) => b[1].totalApplied - a[1].totalApplied)
      .forEach(([userName, stats]) => {
        console.log(`${userName.padEnd(10, ' ')} - ${stats.courseCount} 門課程，申請 NT$ ${stats.totalApplied.toLocaleString()}`);
      });

    // 輸出到檔案
    if (outputFilePath) {
      fs.writeFileSync(
        outputFilePath,
        JSON.stringify(result.courses, null, 2),
        'utf8'
      );
      console.log(`\n✅ 已成功將 ${result.courses.length} 筆資料寫入：${outputFilePath}`);
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('📄 完整 JSON 輸出');
      console.log('='.repeat(60));
      console.log(JSON.stringify(result.courses, null, 2));
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
  parseTrainingCourses,
  parseDate,
  formatDate,
  parseNumber
};
