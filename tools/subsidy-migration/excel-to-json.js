/**
 * Excel 轉 JSON 工具
 *
 * 用途：將 Excel 檔案轉換為 JSON 格式，方便後續遷移腳本使用
 *
 * 使用方式：
 * node excel-to-json.js <excel檔案路徑> [sheet名稱]
 *
 * 範例：
 * node excel-to-json.js ../../docs/plans/001-subsidy-application/公司資產報表.xlsx
 * node excel-to-json.js ../../docs/plans/001-subsidy-application/午餐菜單.xlsx
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// 檢查命令列參數
if (process.argv.length < 3) {
  console.error('使用方式: node excel-to-json.js <excel檔案路徑> [sheet名稱]');
  process.exit(1);
}

const excelFilePath = process.argv[2];
const targetSheetName = process.argv[3]; // 可選：指定要轉換的 sheet

// 檢查檔案是否存在
if (!fs.existsSync(excelFilePath)) {
  console.error(`錯誤：找不到檔案 ${excelFilePath}`);
  process.exit(1);
}

try {
  console.log(`讀取 Excel 檔案: ${excelFilePath}`);

  // 讀取 Excel 檔案
  const workbook = XLSX.readFile(excelFilePath);

  console.log(`找到的 Sheet 名稱: ${workbook.SheetNames.join(', ')}`);

  // 決定要處理的 sheets
  const sheetsToProcess = targetSheetName
    ? [targetSheetName]
    : workbook.SheetNames;

  // 轉換每個 sheet 為 JSON
  const result = {};

  sheetsToProcess.forEach(sheetName => {
    if (!workbook.SheetNames.includes(sheetName)) {
      console.warn(`警告：找不到 sheet "${sheetName}"，跳過`);
      return;
    }

    console.log(`轉換 sheet: ${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];

    // 轉換為 JSON，保留原始標題
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false, // 將日期轉為字串
      defval: null // 空白儲存格設為 null
    });

    result[sheetName] = jsonData;
    console.log(`  - 共 ${jsonData.length} 筆資料`);
  });

  // 產生輸出檔案名稱
  const baseName = path.basename(excelFilePath, path.extname(excelFilePath));
  const outputFileName = `${baseName}.json`;
  const outputPath = path.join(__dirname, outputFileName);

  // 寫入 JSON 檔案
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

  console.log(`\n✓ 成功轉換！`);
  console.log(`輸出檔案: ${outputPath}`);
  console.log(`\n資料摘要:`);
  Object.keys(result).forEach(sheetName => {
    console.log(`  ${sheetName}: ${result[sheetName].length} 筆`);
  });

} catch (error) {
  console.error('轉換失敗:', error.message);
  process.exit(1);
}
