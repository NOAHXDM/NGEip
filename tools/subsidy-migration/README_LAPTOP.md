# 個人筆電補助遷移工具

本工具用於將個人筆電補助資料（包含分期付款資訊）從 Excel 遷移到 Firestore 模擬器。

## 目錄結構

```
tools/subsidy-migration/
├── excel-to-json.js              # Excel 轉 JSON 通用工具
├── laptop-subsidy-parser.js      # 個人筆電專用解析器
├── migrate-laptop-subsidies.js   # Firestore 遷移腳本
├── 個人筆電.json                  # Excel 原始轉換的 JSON
└── laptop-subsidies.json         # 解析後的員工補助資料
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
node excel-to-json.js "../../docs/plans/001-subsidy-application/個人筆電.xlsx"
```

這會生成 `個人筆電.json` 檔案。

### 步驟 3：解析個人筆電資料

```bash
node laptop-subsidy-parser.js 個人筆電.json laptop-subsidies.json
```

這個步驟會：
- 解析每位員工的分期付款資訊
- 支援多種日期格式（M/D/YY、YYYY/MM/DD）
- 計算每期金額和總金額
- 處理發票金額（含逗號分隔符）
- 自動判斷申請日期（第一期的領取日期）
- 顯示詳細統計資訊
- 輸出清理後的 JSON 檔案

輸出範例：
```
====================================
📊 統計資訊
====================================
員工總數：10
總分期數：180 期
分期範圍：3 ~ 32 期
有發票金額：8 人
無發票金額：2 人
日期範圍：2023-05-10 ~ 2025-12-11
分期總金額：NT$ 203,000
發票總金額：NT$ 541,098

====================================
📝 員工範例（前 5 筆）
====================================
 1. 莊栢瑞 | 19 期 | 月付總計 NT$ 19,000 | 無發票 | 申請日期 2023-05-10
 2. 林承翰 | 17 期 | 月付總計 NT$ 17,000 | 無發票 | 申請日期 2023-07-11
 3. 吳奇燊 | 32 期 | 月付總計 NT$ 42,000 | 發票 NT$ 53,900 | 申請日期 2023-05-10
 4. 李宗翰 | 32 期 | 月付總計 NT$ 32,000 | 發票 NT$ 80,000 | 申請日期 2023-05-10
 5. 翁聖凱 | 25 期 | 月付總計 NT$ 31,500 | 發票 NT$ 85,900 | 申請日期 2023-12-07

====================================
📅 分期詳情範例（莊栢瑞）
====================================
  第  1 期: 2023-05-10 - NT$ 1,000
  第  2 期: 2023-06-10 - NT$ 1,000
  第  3 期: 2023-07-07 - NT$ 1,000
  ...
```

### 步驟 4：遷移到 Firestore

```bash
node migrate-laptop-subsidies.js laptop-subsidies.json
```

這個步驟會：
- 連接到 Firestore 模擬器（localhost:8080）
- 根據姓名查詢使用者 ID
- 建立補助申請記錄到 `subsidyApplications` 集合
- 包含完整的分期付款資訊
- 建立稽核軌跡記錄
- 顯示遷移結果

輸出範例：
```
✓ 莊栢瑞 | 19 期 | 月付 NT$ 19,000 | 無發票 → abc123xyz
✓ 林承翰 | 17 期 | 月付 NT$ 17,000 | 無發票 → def456uvw
✓ 吳奇燊 | 32 期 | 月付 NT$ 42,000 | 發票 NT$ 53,900 → ghi789rst
...

============================================================
遷移完成！
============================================================
✓ 成功: 10 筆
⚠ 跳過: 0 筆
✗ 失敗: 0 筆
總計處理: 10 筆

📊 補助統計:
  月付總額: NT$ 203,000
  發票總額: NT$ 541,098
  總分期數: 180 期
```

## 資料結構

### Excel 原始資料格式

Excel 檔案採用特殊的橫向分期結構：

**每位員工佔據 2-3 列：**
1. **第一列**：員工資訊 + 每期的領取日期
   - 欄位 `期數`：員工姓名
   - 欄位 `期數_1`：發票金額（例如 "53,900" 或 "-"）
   - 欄位 `1`, `2`, `3`...`36`：第 1 期、第 2 期...第 36 期的領取日期
   - 欄位 `__EMPTY`：固定為 "領取日期"

2. **第二列**（可選）：每期的補助金額
   - 欄位 `1`, `2`, `3`...`36`：第 1 期、第 2 期...第 36 期的金額
   - 欄位 `__EMPTY`：固定為 "金額"

**範例結構：**
```
| 期數   | 1        | 2        | 3        | ... | 期數_1  | __EMPTY   |
|--------|----------|----------|----------|-----|---------|-----------|
| 吳奇燊 | 5/10/23  | 6/10/23  | 7/10/23  | ... | 53,900  | 領取日期  |
|        | 1000     | 1000     | 1000     | ... |         | 金額      |
```

### 解析後的資料 (laptop-subsidies.json)

```json
{
  "userName": "吳奇燊",
  "applicationDate": "2023-05-10",
  "invoiceAmount": 53900,
  "totalMonthlyAmount": 42000,
  "installmentCount": 32,
  "installments": [
    {
      "period": 1,
      "paymentDate": "2023-05-10",
      "amount": 1000
    },
    {
      "period": 2,
      "paymentDate": "2023-06-10",
      "amount": 1000
    }
  ],
  "originalInvoiceAmountStr": "53,900"
}
```

欄位說明：
- `userName`：員工姓名
- `applicationDate`：申請日期（第一期的領取日期）
- `invoiceAmount`：發票金額（可能為 null）
- `totalMonthlyAmount`：月付總額（所有分期金額加總，**僅用於驗證和顯示，不會寫入 Firestore**）
- `installmentCount`：分期數（**僅用於驗證和顯示，不會寫入 Firestore**）
- `installments`：分期詳情陣列（遷移時會轉為子集合）
  - `period`：期數（1, 2, 3...）→ 寫入 Firestore 時為 `installmentNumber`
  - `paymentDate`：領取日期（YYYY-MM-DD）→ 寫入 Firestore 時為 `receivedDate`
  - `amount`：該期金額
- `originalInvoiceAmountStr`：原始發票金額字串

**注意：** `totalMonthlyAmount` 和 `installmentCount` 僅在解析階段用於資料驗證和終端輸出，遷移到 Firestore 時不會儲存這些欄位，統計資訊將從 `installments` 子集合動態計算。

### Firestore 補助申請記錄

```
subsidyApplications/{applicationId}
├── userId: string
├── type: 1 (SubsidyType.Laptop)
├── status: "approved"
├── applicationDate: Timestamp (第一期領取日期)
├── approvedAmount: number (發票金額的 80%，上限 54000)
├── content: string ("個人筆電")
├── notes: string (發票金額 | 核准金額 | 分期數 | 月付總計)
├── invoiceAmount: number|null (發票金額)
├── createdAt: Timestamp
├── updatedAt: Timestamp
├── installments/ (子集合)
│   └── {installmentId}
│       ├── installmentNumber: number (期數)
│       ├── receivedDate: Timestamp (領取日期)
│       ├── amount: number
│       └── createdAt: Timestamp
└── auditTrail/ (子集合)
    └── {auditId}
        ├── action: "create"
        ├── actionBy: "system"
        ├── actionDateTime: Timestamp
        └── content: string (原始資料的 JSON)
```

**注意：** 分期數和月付總計等統計資訊是從 `installments` 子集合動態計算得出，不儲存於文件中以避免資料冗餘。

**notes 欄位範例：**
```
發票金額: NT$ 53,900 | 核准金額: NT$ 43,120 (發票金額 80%) | 分期數: 32 期 | 月付總計: NT$ 42,000
```

或（發票金額超過上限的情況）

```
發票金額: NT$ 85,900 | 核准金額: NT$ 54,000 (發票金額 80%) | 分期數: 25 期 | 月付總計: NT$ 31,500
```

或（無發票的情況）

```
發票金額: 無 | 分期數: 19 期 | 月付總計: NT$ 19,000
```

## 核准金額計算規則

核准金額計算邏輯：**發票金額的 80%，但最多不超過 NT$ 54,000**

### 計算公式

```
approvedAmount = Math.min(invoiceAmount × 0.8, 54000)
```

### 計算範例

| 發票金額 | 計算過程 | 核准金額 | 說明 |
|---------|---------|---------|------|
| NT$ 53,900 | 53,900 × 0.8 = 43,120 | NT$ 43,120 | 未達上限 |
| NT$ 80,000 | 80,000 × 0.8 = 64,000 → 54,000 | NT$ 54,000 | 超過上限，取上限 |
| NT$ 85,900 | 85,900 × 0.8 = 68,720 → 54,000 | NT$ 54,000 | 超過上限，取上限 |
| NT$ 45,956 | 45,956 × 0.8 = 36,764.8 | NT$ 36,764.8 | 未達上限 |
| null (無發票) | - | null | 無發票則為 null |

### 與月付總額的關係

- **發票金額**：筆電的實際售價
- **核准金額**：公司核准補助的金額（發票金額 80%，上限 54000）
- **月付總額**：實際分期支付給員工的金額（僅供參考）

**注意：** 核准金額和月付總額可能不同，核准金額是政策規定的補助額度。

## 申請日期決定規則

根據需求，**申請日期 = 第一期領取日期**。

解析器會自動找出每位員工的第一個有效期數的領取日期作為申請日期。

**範例：**
- 吳奇燊第 1 期領取日期：2023-05-10 → 申請日期：2023-05-10
- 翁聖凱第 1 期領取日期：2023-12-07 → 申請日期：2023-12-07

## 發票金額處理

### 有發票金額

Excel 中記錄為帶逗號的數字字串（例如 "53,900"）：
- 解析器會移除逗號並轉為數字
- 遷移時存入 `invoiceAmount` 欄位

### 無發票金額

Excel 中記錄為 "-"：
- 解析為 `null`
- 遷移時 `invoiceAmount` 欄位為 `null`

## 分期金額模式

不同員工的分期金額模式不同：

### 固定金額模式

每期金額都相同（例如莊栢瑞、林承翰）：
- 第 1~19 期：NT$ 1,000

### 階梯式金額模式

隨著期數增加，金額提高（例如吳奇燊、翁聖凱）：
- 第 1~20 期：NT$ 1,000
- 第 21~24 期：NT$ 1,500
- 第 25~32 期：NT$ 2,000

## 日期格式處理

### 支援的格式

解析器支援以下日期格式：
1. **M/D/YY**：單位數月/日，例如 "5/10/23"
2. **MM/DD/YY**：兩位數月/日，例如 "12/24/25"
3. **YYYY/MM/DD**：完整年份，例如 "2024/08/02"

### 年份判斷規則

兩位數年份會根據以下規則轉換：
- `00-49` → `2000-2049`
- `50-99` → `1950-1999`

### 日期轉換範例

```
原始格式         解析結果
5/10/23      →  2023-05-10
12/24/25     →  2025-12-24
2024/08/02   →  2024-08-02
2025/3/14    →  2025-03-14
```

## 常見問題

### Q1: 為什麼有些員工沒有發票金額？

有兩種可能：
1. **尚未提供發票**：員工可能分期購買，發票尚未開立
2. **Excel 標記為 "-"**：表示沒有發票或不適用

這不影響遷移，系統會將 `invoiceAmount` 設為 `null`。

### Q2: 核准金額、月付總額和發票金額的關係？

三者說明：
- **發票金額**：筆電的實際售價（原始發票金額）
- **核准金額**：公司政策核准的補助金額（發票金額 80%，上限 54000）
- **月付總額**：實際分期支付給員工的金額（所有分期加總）

**範例：**
- 吳奇燊：
  - 發票金額：NT$ 53,900
  - 核准金額：NT$ 43,120（53,900 × 0.8）
  - 月付總額：NT$ 42,000（32 期 × 1000 等）

**說明：** 核准金額是政策規定的補助額度，月付總額是實際執行的分期付款。

### Q3: 分期數不同代表什麼？

不同員工的分期數反映：
1. **申請時間不同**：較早申請的員工期數較多
2. **補助方案不同**：可能有不同的補助政策
3. **尚未結清**：新進員工期數較少

**範例：**
- 張叔安：3 期（2025-11 申請，較新）
- 吳奇燊：32 期（2023-05 申請，較早）

### Q4: 如何驗證遷移結果？

1. **查看模擬器 UI**：http://localhost:4000/firestore
2. **檢查 `subsidyApplications` 集合**：
   - 確認補助類型為 `1`（Laptop）
   - 檢查 `installments` 陣列是否完整
   - 驗證分期數和總金額
3. **檢查稽核軌跡**：
   - 展開單筆記錄的 `auditTrail` 子集合
   - 確認有系統建立記錄

### Q5: 可以重複執行遷移嗎？

可以，但請注意：
- 重複執行會建立**新的記錄**
- 這會導致重複的補助申請
- **建議**：遷移前先清空 `subsidyApplications` 集合

### Q6: 分期資訊如何查詢？

Firestore 查詢範例：

```javascript
// 查詢特定員工的筆電補助
const subsidies = await db.collection('subsidyApplications')
  .where('userId', '==', userId)
  .where('type', '==', 1)
  .get();

// 取得補助申請記錄
const applicationDoc = subsidies.docs[0];
const applicationData = applicationDoc.data();

// 查詢分期資訊子集合
const installmentsSnapshot = await applicationDoc.ref
  .collection('installments')
  .orderBy('installmentNumber', 'asc')
  .get();

const installments = installmentsSnapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));

// 查詢特定期數
const period5Snapshot = await applicationDoc.ref
  .collection('installments')
  .where('installmentNumber', '==', 5)
  .limit(1)
  .get();
```

## 技術細節

### 補助類型定義

```javascript
const SubsidyType = {
  Laptop: 1,       // 個人筆電
  HealthCheck: 2,  // 健檢
  Training: 3,     // 進修課程
  AITool: 4,       // AI 工具
  Travel: 5        // 旅遊
};
```

個人筆電使用 `type: 1`。

### 補助狀態定義

```javascript
const SubsidyStatus = {
  Pending: 'pending',     // 待審核
  Approved: 'approved',   // 已核准
  Rejected: 'rejected'    // 已拒絕
};
```

歷史資料預設為 `status: 'approved'`（已核准）。

### 分期資訊結構

分期資訊儲存為 `installments` 子集合，每個文件結構：

```javascript
installments/{installmentId}
{
  installmentNumber: 1,                         // 期數
  receivedDate: Timestamp.fromDate(new Date()), // 領取日期
  amount: 1000,                                 // 金額
  createdAt: Timestamp.now()                    // 建立時間
}
```

**欄位說明：**
- `installmentNumber`：第幾期（1, 2, 3...）
- `receivedDate`：該期的領取日期
- `amount`：該期的補助金額
- `createdAt`：文件建立時間

**優點：**
- 支援按期數查詢和排序
- 便於分頁顯示分期資訊
- 不受 Firestore 陣列大小限制

### Excel 資料解析邏輯

```javascript
// 識別員工資料列
if (row['期數'] && row['__EMPTY'] === '領取日期') {
  const userName = row['期數'];
  const invoiceAmount = parseAmount(row['期數_1']);

  // 遍歷所有期數（1-36）
  for (let period = 1; period <= 36; period++) {
    const dateStr = row[String(period)];
    if (dateStr) {
      // 找到該期的日期
      const date = parseDate(dateStr);

      // 從下一列找金額
      const amountRow = records[i + 1];
      const amount = amountRow[String(period)];
    }
  }
}
```

### 使用者 ID 快取

為避免重複查詢，腳本會快取使用者 ID：
```javascript
const userCache = {};
userCache[userName] = userId;
```

## 進階用法

### 只解析不遷移

如果只想查看資料而不實際遷移：

```bash
# 只解析，不指定輸出檔案（資料會輸出到終端）
node laptop-subsidy-parser.js 個人筆電.json
```

### 過濾特定員工

手動編輯 `laptop-subsidies.json`，只保留需要的記錄：

```bash
# 範例：只保留分期數大於 20 期的員工
cat laptop-subsidies.json | jq '[.[] | select(.installmentCount > 20)]' > long-term-only.json
node migrate-laptop-subsidies.js long-term-only.json
```

### 分析分期金額分布

```bash
# 統計每期金額
cat laptop-subsidies.json | jq '[.[] | .installments[] | .amount] | group_by(.) | map({amount: .[0], count: length})'
```

輸出：
```json
[
  {"amount": 1000, "count": 145},
  {"amount": 1500, "count": 23},
  {"amount": 2000, "count": 12}
]
```

### 查詢特定日期範圍

```bash
# 查詢 2024 年申請的員工
cat laptop-subsidies.json | jq '[.[] | select(.applicationDate | startswith("2024"))]'
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
   - 重複執行會建立重複記錄
   - 建議清空 `subsidyApplications` 集合後重新執行

5. **分期資訊完整性**
   - 所有分期資訊儲存在 `installments` 子集合中
   - 可用於展示分期明細、計算剩餘期數
   - 支援靈活的查詢和排序

### 資料完整性驗證

遷移後建議驗證：
- ✅ 員工數量是否正確（10 人）
- ✅ `approvedAmount` 計算正確（發票金額 80%，上限 54000）
- ✅ 發票金額是否正確存入
- ✅ `installments` 子集合是否完整建立
- ✅ 每位員工的分期數是否正確
- ✅ 分期資訊的 `installmentNumber`、`receivedDate`、`amount` 是否正確
- ✅ notes 欄位包含核准金額資訊

### 效能考量

- **使用者快取**：避免重複查詢相同使用者
- **批次處理**：每筆記錄獨立處理，失敗不影響其他記錄
- **分期資訊**：以陣列形式存儲，便於查詢和展示

## 故障排除

### Excel 結構異常

**問題**：解析失敗或資料不完整

**可能原因**：
- Excel 工作表結構改變
- 新增或刪除了欄位
- 期數超過 36 期

**解決方法**：
1. 檢查 Excel 檔案結構是否符合預期
2. 確認欄位名稱（`期數`、`期數_1`、`__EMPTY`）是否正確
3. 查看 `個人筆電.json` 確認轉換結果

### 日期解析失敗

**問題**：顯示「無法解析日期」警告

**可能原因**：
- 日期格式不符合支援的格式
- 日期包含額外空白或特殊字元
- Excel 轉換過程中格式改變

**解決方法**：
1. 檢查 Excel 原始檔案的日期格式
2. 手動修正 `個人筆電.json` 中的問題日期
3. 重新執行解析器

### 金額計算錯誤

**問題**：月付總額與預期不符

**可能原因**：
- 金額列缺失或格式錯誤
- 某些期數的金額為 null

**解決方法**：
1. 檢查 Excel 中每期的金額是否正確
2. 確認金額列的 `__EMPTY` 欄位為 "金額"
3. 查看解析後的 `installments` 陣列

### 找不到使用者

**問題**：遷移時顯示「找不到使用者 XXX」

**解決方法**：
1. 檢查 `users` 集合是否有該使用者
2. 確認姓名拼寫是否正確
3. 確認使用者是否已啟用

## 相關檔案

- **實作計畫**：`docs/plans/001-subsidy-application/SUBSIDY_IMPLEMENTATION_PLAN.md`
- **Excel 原始檔**：`docs/plans/001-subsidy-application/個人筆電.xlsx`
- **同步工具說明**：`tools/subsidy-migration/README_SYNC.md`
- **午餐補助遷移**：`tools/subsidy-migration/README_MEAL.md`
- **進修課程遷移**：`tools/subsidy-migration/README_TRAINING.md`
- **旅遊補助遷移**：`tools/subsidy-migration/README_TRAVEL.md`

## 完整工作流程範例

```bash
# 1. 啟動模擬器（在專案根目錄）
npm start

# 2. 切換到工具目錄
cd tools/subsidy-migration

# 3. Excel 轉 JSON
node excel-to-json.js "../../docs/plans/001-subsidy-application/個人筆電.xlsx"

# 4. 解析資料
node laptop-subsidy-parser.js 個人筆電.json laptop-subsidies.json

# 5. 查看解析結果（可選）
cat laptop-subsidies.json | jq '.[0]' # 查看第一筆資料

# 6. 執行遷移
node migrate-laptop-subsidies.js laptop-subsidies.json

# 7. 驗證結果（開啟瀏覽器）
open http://localhost:4000/firestore
```

## 資料統計範例

### 按分期數統計

```bash
cat laptop-subsidies.json | jq 'group_by(.installmentCount) | map({installments: .[0].installmentCount, count: length, employees: map(.userName)})'
```

### 按申請時間統計

```bash
cat laptop-subsidies.json | jq 'group_by(.applicationDate | split("-")[0]) | map({year: .[0].applicationDate | split("-")[0], count: length})'
```

### 發票金額統計

```bash
cat laptop-subsidies.json | jq '{total: (map(.invoiceAmount // 0) | add), avg: (map(.invoiceAmount // 0) | add / length)}'
```

## 更新日誌

### 當前版本
- ✅ 支援 M/D/YY 和 YYYY/MM/DD 日期格式
- ✅ 處理分期付款資訊（最多 36 期）
- ✅ 支援階梯式金額模式
- ✅ 發票金額解析（含逗號處理）
- ✅ 自動判斷申請日期（第一期領取日期）
- ✅ 完整的分期資訊存儲
- ✅ 使用者 ID 快取最佳化
- ✅ 詳細的統計資訊和摘要
- ✅ 完整的錯誤處理和報告
- ✅ 稽核軌跡記錄
