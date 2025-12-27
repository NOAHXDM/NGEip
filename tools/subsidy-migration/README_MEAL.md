# 午餐補助遷移工具

本工具用於將午餐訂購紀錄從 Excel 遷移到 Firestore 模擬器。

## 目錄結構

```
tools/subsidy-migration/
├── lunch-order-parser.js         # 午餐訂購紀錄解析器
├── migrate-lunch-orders.js       # Firestore 遷移腳本
└── lunch-orders.json             # 解析後的訂單資料
```

## 使用步驟

### 步驟 1：啟動 Firebase 模擬器

在專案根目錄執行：

```bash
npm start
```

這會啟動 Firebase 模擬器：
- Auth 模擬器：http://localhost:9099
- Firestore 模擬器：http://localhost:8080
- 模擬器 UI：http://localhost:4000

### 步驟 2：將 Excel 轉換為 JSON

```bash
cd tools/subsidy-migration
node lunch-order-parser.js "../../docs/plans/001-subsidy-application/午餐訂購紀錄.xlsx" lunch-orders.json
```

這個步驟會：
- 讀取所有工作表的訂購紀錄
- 解析 Excel 日期格式
- 識別日期、店家、餐點、價格欄位
- 過濾無效訂單（null、p、pass、怕死等）
- 顯示統計資訊
- 輸出清理後的 JSON 檔案

輸出範例：
```
====================================
📊 統計資訊
====================================
工作表數量：12
訂單總數：1,234
訂餐人數：28
訂餐日期：156 天 (2023-01-01 ~ 2024-12-31)
餐廳列表：美味便當, 健康餐盒, 異國料理
總金額：NT$ 185,100

====================================
📝 訂單範例（前 10 筆）
====================================
 1. [2023-01-03] 翁聖凱 | 美味便當 | 雞腿便當 | NT$ 120
 2. [2023-01-03] 王小明 | 美味便當 | 排骨便當 | NT$ 110
...
```

### 步驟 3：遷移到 Firestore

```bash
node migrate-lunch-orders.js lunch-orders.json
```

這個步驟會：
- 連接到 Firestore 模擬器（localhost:8080）
- 根據姓名查詢使用者 ID
- 將訂單依日期分組
- 處理金額上限（最高 NT$ 150）
- 建立每日餐點記錄到 `mealSubsidies` 集合
- 更新使用者月度統計到 `userMealStats` 集合
- 使用交易確保資料一致性
- 顯示遷移結果

輸出範例：
```
處理日期: 2023-01-03 (28 筆餐點)
  💰 王大明: $180 → $150 (已限制)
  💰 李小華: $165 → $150 (已限制)
  ✓ 成功: 2023-01-03 - 28 筆餐點, 總計 $4,050

============================================================
遷移完成！
============================================================
✓ 成功: 156 個日期
✗ 失敗: 0 個日期
💰 金額被限制: 45 筆 (超過 $150)
```

## 資料結構

### 解析後的訂單資料 (lunch-orders.json)

```json
{
  "sheetName": "2023年1月",
  "date": "2023-01-03",
  "restaurant": "美味便當",
  "userName": "翁聖凱",
  "mealName": "雞腿便當",
  "price": 120
}
```

### Firestore 每日餐點記錄

```
mealSubsidies/{dateId}
├── date: Timestamp (用餐日期)
├── dayOfWeek: number (1-7, 週一到週日)
├── meals: Array<MealEntry>
│   └── MealEntry
│       ├── userId: string
│       ├── orderContent: string (店家 - 餐點名稱)
│       └── amount: number (補助金額, 最高 150)
├── dailyTotal: number (當日總補助金額)
├── userIds: Array<string> (當日訂餐的使用者 ID 列表)
├── createdAt: Timestamp
└── updatedAt: Timestamp
```

**Document ID 格式**：`YYYY-MM-DD` (例如：`2023-01-03`)

### Firestore 使用者月度統計

```
userMealStats/{statsId}
├── userId: string
├── yearMonth: string (YYYY-MM, 例如：2023-01)
├── totalAmount: number (當月總補助金額)
├── mealCount: number (當月訂餐次數)
├── details: Array<DailyDetail>
│   └── DailyDetail
│       ├── date: string (YYYY-MM-DD)
│       └── amount: number (該日補助金額)
└── updatedAt: Timestamp
```

**Document ID 格式**：`{userId}_{yearMonth}` (例如：`abc123_2023-01`)

## Excel 檔案格式說明

### 預期的工作表結構

每個工作表代表一個月份或一週的訂餐記錄，結構如下：

```
第 1 列：日期（Excel 日期數值）+ 餐廳名稱
第 2 列：餐廳備註和「餐費」標籤
第 3 列開始：訂餐資料

範例：
| A 欄     | B 欄           | C 欄 | D 欄 | E 欄   | F 欄           | G 欄 |
|----------|----------------|------|------|--------|----------------|------|
| 46024    | 安南品河粉     | null | null | 46025  | 排圓餐盒       | null |
| null     | 備註:...       | 餐費 | null | null   | 備註:...       | 餐費 |
| 翁聖凱   | 沙威瑪餐盒     | 150  | null | 翁聖凱 | 正宗打拋豬餐盒 | 110  |
| 李宗翰   | null           | null | null | 李宗翰 | null           | null |
| 何宇翔   | 奶油燉魚餐盒   | 150  | null | 何宇翔 | null           | null |
```

### 欄位結構

每個日期對應 3 個欄位：
1. **日期 + 員工名稱欄位**（同一欄）：第 1 列為日期數值，第 3 列起為員工姓名
2. **餐廳 + 餐點欄位**（日期後一欄）：第 1 列為餐廳名稱，第 3 列起為餐點名稱
3. **價格欄位**（日期後兩欄）：餐點價格

### 跳過規則

以下情況的訂單會被跳過：
- 餐點名稱為空
- 餐點名稱為 `null`、`p`、`pass`、`怕死`（不區分大小寫）
- 統計列（第一欄為 `預估金額`、`實際金額`、`個人承擔`、`公司承擔`）

## 金額處理規則

### 補助上限

- **每餐上限**：NT$ 150
- 超過上限的金額會被自動調整為 150 元
- 遷移時會顯示被限制的記錄

範例：
```
💰 王大明: $180 → $150 (已限制)
```

### 缺少價格

- 如果價格欄位為空或非數字，預設為 NT$ 150

## 常見問題

### Q1: 為什麼有些訂單被跳過？

有以下幾種可能：
1. **找不到使用者**：使用者可能已離職或不在系統中
2. **餐點名稱無效**：為 null、p、pass、怕死等
3. **缺少員工名稱**：該筆記錄沒有員工姓名

### Q2: 如何處理 Excel 日期格式？

解析器會自動處理 Excel 日期數值（通常是大於 40000 的數字）：
- Excel 日期基準：1899/12/30
- 自動轉換為 JavaScript Date
- 格式化為 `YYYY-MM-DD` 字串

範例：
- Excel 數值 `44934` → `2023-01-03`

### Q3: 金額被限制會影響原始資料嗎？

不會。遷移腳本會：
- 保留原始金額資訊（在處理過程中顯示）
- 僅將超過上限的金額調整為 150 元後寫入 Firestore
- Excel 原始檔案不會被修改

### Q4: 如何驗證遷移結果？

1. **查看模擬器 UI**：http://localhost:4000/firestore
2. **檢查 `mealSubsidies` 集合**：
   - 確認日期範圍正確
   - 檢查每日訂單數量
   - 驗證總金額計算
3. **檢查 `userMealStats` 集合**：
   - 確認使用者月度統計
   - 驗證訂餐次數和總金額

### Q5: 可以重複執行遷移嗎？

可以，但請注意：
- 重複執行會**覆蓋**相同日期的記錄（Document ID 相同）
- 月度統計會累加（使用 `FieldValue.increment`）
- **建議**：重複執行前先清空 `mealSubsidies` 和 `userMealStats` 集合

### Q6: 同一天沒有訂餐的員工會被記錄嗎？

不會。系統只記錄有實際訂餐的記錄。

## 技術細節

### Excel 日期轉換

```javascript
function excelDateToJSDate(excelDate) {
  const baseDate = new Date(1899, 11, 30);
  const days = Math.floor(excelDate);
  const result = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  return result;
}
```

### 星期計算

```javascript
function getDayOfWeek(date) {
  const day = date.getDay();
  return day === 0 ? 7 : day; // 將週日從 0 改為 7
}
```

**週幾對應**：
- 1 = 週一
- 2 = 週二
- 3 = 週三
- 4 = 週四
- 5 = 週五
- 6 = 週六
- 7 = 週日

### 交易處理流程

遷移使用 Firestore 交易確保資料一致性：

1. **讀取階段**：
   - 批次讀取所有相關的 `userMealStats` 文件

2. **寫入階段**：
   - 建立/更新 `mealSubsidies` 文件（當日記錄）
   - 建立/更新 `userMealStats` 文件（月度統計）

### 使用者 ID 快取

為避免重複查詢，腳本會快取使用者 ID：
```javascript
const userCache = {};
// 第一次查詢後快取
userCache[userName] = userId;
```

## 進階用法

### 只解析不遷移

如果只想查看資料而不實際遷移：

```bash
# 只解析，不指定輸出檔案（資料會輸出到終端）
node lunch-order-parser.js "../../docs/plans/001-subsidy-application/午餐訂購紀錄.xlsx"
```

### 自訂金額上限

編輯 `migrate-lunch-orders.js`，修改常數：

```javascript
// 預設為 150
const MAX_SUBSIDY_AMOUNT = 150;

// 可改為其他值，例如 200
const MAX_SUBSIDY_AMOUNT = 200;
```

### 批次處理多個檔案

```bash
# 建立批次腳本
for file in docs/plans/001-subsidy-application/午餐*.xlsx; do
  node lunch-order-parser.js "$file" "lunch-orders-$(basename "$file" .xlsx).json"
done
```

## 注意事項

### 重要提醒

1. **模擬器連線**
   - 確保 Firebase 模擬器正在運行（`npm start`）
   - 確認 Firestore 模擬器在 port 8080

2. **使用者匹配**
   - 確保系統中有對應的使用者資料（`users` 集合）
   - 使用者名稱必須完全相符（區分大小寫）

3. **資料備份**
   - 遷移前建議先備份模擬器資料
   - 可使用 `sync-from-prod.js` 從正式環境同步資料

4. **重複執行**
   - 相同日期的記錄會被覆蓋
   - 月度統計會累加，建議清空後重新執行

5. **Excel 格式**
   - 確保 Excel 檔案結構符合預期格式
   - 日期必須是 Excel 日期數值格式
   - 建議先用解析器驗證資料

### 效能考量

- **批次大小**：使用交易處理，每日記錄獨立處理
- **使用者快取**：避免重複查詢相同使用者
- **並行處理**：按日期順序處理，確保統計正確

### 資料完整性

遷移後建議驗證：
- ✅ 訂單總數是否正確
- ✅ 訂餐人數是否正確
- ✅ 日期範圍是否完整
- ✅ 總金額計算是否正確
- ✅ 月度統計是否準確

## 故障排除

### 找不到使用者

**問題**：遷移時顯示「找不到使用者 XXX，跳過」

**解決方法**：
1. 檢查 `users` 集合是否有該使用者
2. 確認姓名拼寫是否正確
3. 確認使用者是否已啟用（status 不為 disabled）

### 解析失敗

**問題**：`lunch-order-parser.js` 執行失敗

**可能原因**：
- Excel 檔案格式不符
- 日期格式錯誤
- 工作表結構異常

**解決方法**：
1. 檢查 Excel 檔案是否損壞
2. 確認工作表至少有 3 列資料
3. 確認第一列包含 Excel 日期數值

### 遷移失敗

**問題**：`migrate-lunch-orders.js` 執行失敗

**可能原因**：
- 模擬器未啟動
- JSON 檔案格式錯誤
- 交易衝突

**解決方法**：
1. 確認模擬器正在運行：`curl http://localhost:8080`
2. 驗證 JSON 檔案格式：`node -e "require('./lunch-orders.json')"`
3. 檢查終端錯誤訊息，根據提示修正

### 金額統計不符

**問題**：月度統計總金額不正確

**可能原因**：
- 重複執行遷移導致累加
- 交易未正確提交

**解決方法**：
1. 清空 `userMealStats` 集合
2. 重新執行遷移
3. 使用模擬器 UI 手動驗證計算

## 相關檔案

- **實作計畫**：`docs/plans/001-subsidy-application/SUBSIDY_IMPLEMENTATION_PLAN.md`
- **Excel 原始檔**：`docs/plans/001-subsidy-application/午餐訂購紀錄.xlsx`
- **同步工具說明**：`tools/subsidy-migration/README_SYNC.md`
- **進修課程遷移**：`tools/subsidy-migration/README_TRAINING.md`

## 完整工作流程範例

```bash
# 1. 啟動模擬器（在專案根目錄）
npm start

# 2. 切換到工具目錄
cd tools/subsidy-migration

# 3. 解析 Excel 檔案
node lunch-order-parser.js \
  "../../docs/plans/001-subsidy-application/午餐訂購紀錄.xlsx" \
  lunch-orders.json

# 4. 查看解析結果（可選）
cat lunch-orders.json | head -n 50

# 5. 執行遷移
node migrate-lunch-orders.js lunch-orders.json

# 6. 驗證結果（開啟瀏覽器）
open http://localhost:4000/firestore
```

## 更新日誌

### 當前版本
- ✅ 支援多工作表解析
- ✅ Excel 日期自動轉換
- ✅ 金額上限自動調整（150 元）
- ✅ 使用者 ID 快取最佳化
- ✅ 交易確保資料一致性
- ✅ 月度統計自動更新
- ✅ 詳細的遷移進度顯示
- ✅ 完整的錯誤處理和報告
