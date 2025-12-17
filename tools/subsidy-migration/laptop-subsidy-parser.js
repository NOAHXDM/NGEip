/**
 * 個人筆電補助解析器
 * 讀取個人筆電 JSON 資料，解析分期付款資訊
 */

const fs = require('fs');

/**
 * 解析日期字串 (支援多種格式)
 * @param {string} dateStr - 日期字串
 * @returns {Date|null}
 */
function parseDate(dateStr) {
  if (!dateStr || dateStr === 'null') return null;

  // 移除空白
  dateStr = String(dateStr).trim();

  // 解析 M/D/YY 或 MM/DD/YY 格式
  const matchShortYear = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (matchShortYear) {
    const [, month, day, year] = matchShortYear;
    // 判斷年份（假設 00-49 為 2000-2049，50-99 為 1950-1999）
    const fullYear = parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year);
    return new Date(fullYear, parseInt(month) - 1, parseInt(day));
  }

  // 解析 YYYY/MM/DD 格式
  const matchLongYear = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (matchLongYear) {
    const [, year, month, day] = matchLongYear;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
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
 * 解析金額（移除逗號，轉為數字）
 * @param {string|number} amount
 * @returns {number|null}
 */
function parseAmount(amount) {
  if (amount === null || amount === undefined || amount === 'null' || amount === '-') {
    return null;
  }

  const cleanAmount = String(amount).replace(/,/g, '');
  const parsed = parseFloat(cleanAmount);
  return isNaN(parsed) ? null : parsed;
}

/**
 * 解析個人筆電補助資料
 * @param {string} jsonFilePath - JSON 檔案路徑
 * @returns {Object} 解析結果
 */
function parseLaptopSubsidies(jsonFilePath) {
  console.log(`\n📂 正在讀取：${jsonFilePath}`);

  if (!fs.existsSync(jsonFilePath)) {
    throw new Error(`找不到檔案: ${jsonFilePath}`);
  }

  const rawData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
  const records = rawData['個人筆電'] || rawData;

  if (!Array.isArray(records)) {
    throw new Error('JSON 格式錯誤：應為陣列或包含「個人筆電」鍵的物件');
  }

  console.log(`\n找到 ${records.length} 列原始資料\n`);

  const parsedEmployees = [];
  let i = 1; // 跳過第一列（標題列）

  while (i < records.length) {
    const row = records[i];

    // 檢查是否是員工資料列（包含姓名）
    if (!row['期數'] || !row['__EMPTY'] || row['__EMPTY'] !== '領取日期') {
      i++;
      continue;
    }

    const userName = row['期數'];
    const invoiceAmountStr = row['期數_1'];
    const invoiceAmount = parseAmount(invoiceAmountStr);

    // 收集所有期數的日期和金額
    const installments = [];
    let totalMonthlyAmount = 0;

    // 找出所有有效的期數
    for (let period = 1; period <= 36; period++) {
      const dateStr = row[String(period)];

      if (!dateStr || dateStr === 'null') {
        continue; // 沒有這一期
      }

      const date = parseDate(dateStr);
      if (!date) {
        console.warn(`  ⚠ ${userName} 第 ${period} 期日期無效: ${dateStr}`);
        continue;
      }

      // 查找對應的金額（下一列）
      let monthlyAmount = 1000; // 預設值
      if (i + 1 < records.length && records[i + 1]['__EMPTY'] === '金額') {
        const amountRow = records[i + 1];
        const amountStr = amountRow[String(period)];
        const parsedMonthlyAmount = parseAmount(amountStr);
        if (parsedMonthlyAmount !== null) {
          monthlyAmount = parsedMonthlyAmount;
        }
      }

      installments.push({
        period,
        paymentDate: formatDate(date),
        amount: monthlyAmount
      });

      totalMonthlyAmount += monthlyAmount;
    }

    if (installments.length === 0) {
      console.warn(`  ⚠ ${userName} 沒有有效的分期記錄，跳過`);
      i++;
      continue;
    }

    // 找出第一期的日期作為申請日期
    const firstInstallment = installments[0];
    const applicationDate = firstInstallment.paymentDate;

    parsedEmployees.push({
      userName,
      applicationDate,
      invoiceAmount,
      totalMonthlyAmount,
      installmentCount: installments.length,
      installments,
      originalInvoiceAmountStr: invoiceAmountStr
    });

    console.log(`  ✓ ${userName}: ${installments.length} 期, 總金額 $${totalMonthlyAmount.toLocaleString()}, 發票金額 ${invoiceAmountStr || '無'}`);

    // 跳過下一列（金額列）
    if (i + 1 < records.length && records[i + 1]['__EMPTY'] === '金額') {
      i += 2;
    } else {
      i++;
    }
  }

  // 計算統計資訊
  const stats = {
    totalEmployees: parsedEmployees.length,
    totalInstallments: parsedEmployees.reduce((sum, e) => sum + e.installmentCount, 0),
    totalMonthlyAmount: parsedEmployees.reduce((sum, e) => sum + e.totalMonthlyAmount, 0),
    totalInvoiceAmount: parsedEmployees
      .filter(e => e.invoiceAmount !== null)
      .reduce((sum, e) => sum + e.invoiceAmount, 0),
    employeesWithInvoice: parsedEmployees.filter(e => e.invoiceAmount !== null).length,
    employeesWithoutInvoice: parsedEmployees.filter(e => e.invoiceAmount === null).length,
    dateRange: {
      earliest: parsedEmployees.length > 0
        ? parsedEmployees.map(e => e.applicationDate).sort()[0]
        : null,
      latest: parsedEmployees.length > 0
        ? parsedEmployees
            .flatMap(e => e.installments.map(i => i.paymentDate))
            .sort()
            .reverse()[0]
        : null
    },
    installmentRange: {
      min: parsedEmployees.length > 0
        ? Math.min(...parsedEmployees.map(e => e.installmentCount))
        : 0,
      max: parsedEmployees.length > 0
        ? Math.max(...parsedEmployees.map(e => e.installmentCount))
        : 0
    }
  };

  return {
    stats,
    employees: parsedEmployees
  };
}

/**
 * 主程式
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('使用方式：');
    console.log('  node laptop-subsidy-parser.js <json檔案路徑> [輸出檔案路徑]');
    console.log('');
    console.log('範例：');
    console.log('  node laptop-subsidy-parser.js 個人筆電.json');
    console.log('  node laptop-subsidy-parser.js 個人筆電.json laptop-subsidies.json');
    process.exit(1);
  }

  const jsonFilePath = args[0];
  const outputFilePath = args[1];

  try {
    const result = parseLaptopSubsidies(jsonFilePath);

    // 顯示統計資訊
    console.log('\n' + '='.repeat(60));
    console.log('📊 統計資訊');
    console.log('='.repeat(60));
    console.log(`員工總數：${result.stats.totalEmployees}`);
    console.log(`總分期數：${result.stats.totalInstallments} 期`);
    console.log(`分期範圍：${result.stats.installmentRange.min} ~ ${result.stats.installmentRange.max} 期`);
    console.log(`有發票金額：${result.stats.employeesWithInvoice} 人`);
    console.log(`無發票金額：${result.stats.employeesWithoutInvoice} 人`);
    console.log(`日期範圍：${result.stats.dateRange.earliest} ~ ${result.stats.dateRange.latest}`);
    console.log(`分期總金額：NT$ ${result.stats.totalMonthlyAmount.toLocaleString()}`);
    console.log(`發票總金額：NT$ ${result.stats.totalInvoiceAmount.toLocaleString()}`);

    // 顯示範例
    console.log('\n' + '='.repeat(60));
    console.log('📝 員工範例（前 5 筆）');
    console.log('='.repeat(60));
    result.employees.slice(0, 5).forEach((emp, idx) => {
      const invoiceStr = emp.invoiceAmount !== null
        ? `發票 NT$ ${emp.invoiceAmount.toLocaleString()}`
        : '無發票';
      console.log(`${String(idx + 1).padStart(2, ' ')}. ${emp.userName} | ${emp.installmentCount} 期 | 月付總計 NT$ ${emp.totalMonthlyAmount.toLocaleString()} | ${invoiceStr} | 申請日期 ${emp.applicationDate}`);
    });

    // 顯示分期詳情範例
    if (result.employees.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log(`📅 分期詳情範例（${result.employees[0].userName}）`);
      console.log('='.repeat(60));
      result.employees[0].installments.slice(0, 10).forEach(inst => {
        console.log(`  第 ${String(inst.period).padStart(2, ' ')} 期: ${inst.paymentDate} - NT$ ${inst.amount.toLocaleString()}`);
      });
      if (result.employees[0].installments.length > 10) {
        console.log(`  ... 還有 ${result.employees[0].installments.length - 10} 期`);
      }
    }

    // 輸出到檔案或顯示
    if (outputFilePath) {
      fs.writeFileSync(
        outputFilePath,
        JSON.stringify(result.employees, null, 2),
        'utf8'
      );
      console.log(`\n✅ 已成功將 ${result.employees.length} 筆員工資料寫入：${outputFilePath}`);
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('📄 完整 JSON 輸出');
      console.log('='.repeat(60));
      console.log(JSON.stringify(result.employees, null, 2));
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
  parseLaptopSubsidies,
  parseDate,
  formatDate,
  parseAmount
};
