# 旅遊補助遷移工具

本工具用於將旅遊補助資料從 Excel 遷移到 Firestore 模擬器。

## 目錄結構

```
tools/subsidy-migration/
├── excel-to-json.js              # Excel 轉 JSON 通用工具
├── travel-subsidy-parser.js      # 旅遊補助專用解析器
├── migrate-travel-subsidies.js   # Firestore 遷移腳本
├── 旅遊補助.json                  # Excel 原始轉換的 JSON
└── travel-subsidies.json         # 解析後的清理資料
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
node excel-to-json.js "../../docs/plans/001-subsidy-application/旅遊補助.xlsx"
```

這會生成 `旅遊補助.json` 檔案。

### 步驟 3：解析旅遊補助資料

```bash
node travel-subsidy-parser.js 旅遊補助.json travel-subsidies.json
```

這個步驟會：
- 解析各種日期格式（M/D/YY）
- 將金額從字串轉換為數字
- 過濾無效記錄（日期或金額為 null）
- 自動判斷旅遊類型（員工旅遊、個人旅遊）
- 計算統計資訊
- 顯示詳細摘要
- 輸出清理後的 JSON 檔案

輸出範例：
```
====================================
📊 統計資訊
====================================
原始資料數：67
有效記錄數：54
跳過記錄數：13
申請人數：32
日期範圍：2024-04-01 ~ 2025-12-24
總補助金額：NT$ 1,789,026

📋 依類型統計：
  員工旅遊: 35 筆, NT$ 1,156,416
  個人旅遊: 19 筆, NT$ 632,610

====================================
📝 資料範例（前 10 筆）
====================================
 1. [2025-12-24] 翁聖凱 | 個人旅遊 | 個人旅遊 | NT$ 10,000
 2. [2025-09-29] 翁聖凱 | 員工旅遊 | 2025員旅 | NT$ 38,900
 3. [2024-04-01] 李宗翰 | 員工旅遊 | 2024員旅 | NT$ 32,300
...
```

### 步驟 4：遷移到 Firestore

```bash
node migrate-travel-subsidies.js travel-subsidies.json
```

這個步驟會：
- 連接到 Firestore 模擬器（localhost:8080）
- 根據姓名查詢使用者 ID
- 建立補助申請記錄到 `subsidyApplications` 集合
- 建立稽核軌跡記錄
- 顯示遷移結果

輸出範例：
```
✓ 翁聖凱 | 個人旅遊 | 2025-12-24 | NT$ 10,000 → abc123xyz
✓ 翁聖凱 | 員工旅遊 | 2025-09-29 | NT$ 38,900 → def456uvw
...

============================================================
遷移完成！
============================================================
✓ 成功: 52 筆
⚠ 跳過: 2 筆
✗ 失敗: 0 筆
總計處理: 54 筆

📊 補助類型統計:
  員工旅遊: 35 筆, NT$ 1,156,416
  個人旅遊: 17 筆, NT$ 622,610
```

## 資料結構

### Excel 原始資料格式

Excel 檔案包含以下欄位：
- **姓名**：員工姓名
- **日期**：申請日期（M/D/YY 格式，例如 "12/24/25" 或 "4/1/24"）
- **金額**：補助金額（字串格式）
- **內容**：旅遊內容描述（例如 "個人旅遊"、"2024員旅"）

### 解析後的資料 (travel-subsidies.json)

```json
{
  "userName": "翁聖凱",
  "applicationDate": "2025-12-24",
  "amount": 10000,
  "content": "個人旅遊",
  "travelType": "個人旅遊",
  "originalDateStr": "12/24/25",
  "originalAmountStr": "10000"
}
```

欄位說明：
- `userName`：員工姓名
- `applicationDate`：標準化的日期（YYYY-MM-DD）
- `amount`：金額（數字格式）
- `content`：原始內容描述
- `travelType`：自動判斷的旅遊類型
- `originalDateStr`：原始日期字串（用於除錯）
- `originalAmountStr`：原始金額字串（用於除錯）

### Firestore 補助申請記錄

```
subsidyApplications/{applicationId}
├── userId: string
├── type: 5 (SubsidyType.Travel)
├── status: "approved"
├── applicationDate: Timestamp
├── approvedAmount: number
├── content: string (旅遊內容描述)
├── notes: string (旅遊類型資訊)
├── createdAt: Timestamp
├── updatedAt: Timestamp
└── auditTrail/ (子集合)
    └── {auditId}
        ├── action: "create"
        ├── actionBy: "system"
        ├── actionDateTime: Timestamp
        └── content: string (原始資料的 JSON)
```

## 旅遊類型分類

解析器會根據 `content` 欄位自動判斷旅遊類型：

| content 內容 | 判斷規則 | 分類結果 |
|-------------|---------|---------|
| 包含「員旅」 | 字串包含「員旅」 | 員工旅遊 |
| 包含「個人」 | 字串包含「個人」 | 個人旅遊 |
| 其他 | 不符合上述條件 | 其他 |

範例：
- "2024員旅" → 員工旅遊
- "2025員旅" → 員工旅遊
- "個人旅遊" → 個人旅遊
- "家庭旅遊" → 其他

## 日期格式處理

### 支援的格式

解析器支援以下日期格式：
- `M/D/YY`：單位數月/日，例如 "4/1/24"
- `MM/DD/YY`：兩位數月/日，例如 "12/24/25"

### 年份判斷規則

兩位數年份會根據以下規則轉換為四位數：
- `00-49` → `2000-2049`
- `50-99` → `1950-1999`

範例：
- "12/24/25" → 2025-12-24
- "4/1/24" → 2024-04-01
- "9/9/74" → 1974-09-09（理論上）

### 日期轉換流程

```
原始格式         解析步驟              標準格式
12/24/25    →   12月 24日 2025年  →   2025-12-24
4/1/24      →   4月 1日 2024年    →   2024-04-01
```

## 常見問題

### Q1: 為什麼有些記錄被跳過？

有以下幾種可能：
1. **找不到使用者**：使用者可能已離職或不在系統中
2. **日期為 null**：該員工尚未使用旅遊補助
3. **金額為 null 或 0**：無效的補助金額
4. **內容為 null**：缺少旅遊內容描述

範例（會被跳過的記錄）：
```json
{
  "姓名": "吳思昀",
  "日期": null,
  "金額": null,
  "內容": null
}
```

### Q2: 如何處理日期格式錯誤？

解析器支援 `M/D/YY` 格式，如果遇到無法解析的格式：
1. 系統會顯示警告訊息
2. 該筆記錄會被跳過
3. 繼續處理下一筆資料

建議：檢查 Excel 原始檔案的日期格式是否正確。

### Q3: 員工旅遊和個人旅遊有什麼差別？

**員工旅遊**：
- 公司組織的團體旅遊
- 通常金額較高（20,000 ~ 40,000）
- 內容包含「員旅」字樣

**個人旅遊**：
- 員工自行規劃的旅遊
- 通常金額為 10,000 元（可能有例外）
- 內容包含「個人」字樣

### Q4: 如何驗證遷移結果？

1. **查看模擬器 UI**：http://localhost:4000/firestore
2. **檢查 `subsidyApplications` 集合**：
   - 確認記錄數量正確
   - 檢查補助類型為 `5`（Travel）
   - 驗證金額和日期
3. **檢查稽核軌跡**：
   - 展開單筆記錄的 `auditTrail` 子集合
   - 確認有系統建立記錄

### Q5: 可以重複執行遷移嗎？

可以，但請注意：
- 重複執行會建立**新的記錄**（不會更新現有記錄）
- 這會導致重複的補助申請
- **建議**：遷移前先清空 `subsidyApplications` 集合，或使用模擬器的重置功能

### Q6: 金額格式有什麼限制？

- 金額必須是有效的數字
- 可以是整數或小數
- 不能為 null 或 0
- 沒有上限限制（旅遊補助金額因員旅而異）

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

旅遊補助使用 `type: 5`。

### 補助狀態定義

```javascript
const SubsidyStatus = {
  Pending: 'pending',     // 待審核
  Approved: 'approved',   // 已核准
  Rejected: 'rejected'    // 已拒絕
};
```

歷史資料預設為 `status: 'approved'`（已核准）。

### 日期解析函式

```javascript
function parseDate(dateStr) {
  // 解析 M/D/YY 或 MM/DD/YY 格式
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (match) {
    const [, month, day, year] = match;

    // 判斷年份（00-49 為 2000-2049，50-99 為 1950-1999）
    const fullYear = parseInt(year) < 50
      ? 2000 + parseInt(year)
      : 1900 + parseInt(year);

    return new Date(fullYear, parseInt(month) - 1, parseInt(day));
  }

  return null;
}
```

### 旅遊類型判斷

```javascript
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
```

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
node travel-subsidy-parser.js 旅遊補助.json
```

### 過濾特定旅遊類型

手動編輯 `travel-subsidies.json`，只保留需要的記錄：

```bash
# 範例：只保留員工旅遊
cat travel-subsidies.json | jq '[.[] | select(.travelType == "員工旅遊")]' > employee-travel-only.json
node migrate-travel-subsidies.js employee-travel-only.json
```

### 驗證資料完整性

執行遷移前，先驗證 JSON 資料：

```bash
# 檢查 JSON 格式
node -e "require('./travel-subsidies.json')"

# 統計記錄數
cat travel-subsidies.json | jq 'length'

# 查看所有使用者
cat travel-subsidies.json | jq '[.[] | .userName] | unique'
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

5. **歷史資料狀態**
   - 所有遷移的記錄預設為 `status: 'approved'`
   - 代表這些是已核准的歷史補助

### 資料完整性驗證

遷移後建議驗證：
- ✅ 記錄總數是否正確
- ✅ 申請人數是否正確
- ✅ 日期範圍是否完整
- ✅ 總金額計算是否正確
- ✅ 旅遊類型分類是否合理

### 效能考量

- **使用者快取**：避免重複查詢相同使用者
- **批次處理**：每筆記錄獨立處理，失敗不影響其他記錄
- **錯誤處理**：記錄所有錯誤並在最後統一顯示

## 故障排除

### 找不到使用者

**問題**：遷移時顯示「找不到使用者 XXX，跳過」

**解決方法**：
1. 檢查 `users` 集合是否有該使用者
2. 確認姓名拼寫是否正確（注意繁簡體、空白）
3. 確認使用者是否已啟用（status 不為 disabled）

### 日期解析失敗

**問題**：顯示「無法解析日期」警告

**可能原因**：
- 日期格式不是 M/D/YY
- 日期包含額外空白或特殊字元
- Excel 轉換過程中格式改變

**解決方法**：
1. 檢查 Excel 原始檔案的日期格式
2. 手動修正 `旅遊補助.json` 中的問題日期
3. 重新執行解析器

### 金額格式錯誤

**問題**：金額無法轉換為數字

**可能原因**：
- 金額包含逗號或其他符號
- 金額為文字而非數字

**解決方法**：
1. 檢查 Excel 原始檔案的金額格式
2. 確保金額欄位為數字格式
3. 手動清理 `旅遊補助.json` 中的問題金額

### 遷移失敗

**問題**：`migrate-travel-subsidies.js` 執行失敗

**可能原因**：
- 模擬器未啟動
- JSON 檔案格式錯誤
- Firestore 連線失敗

**解決方法**：
1. 確認模擬器正在運行：`curl http://localhost:8080`
2. 驗證 JSON 檔案格式：`node -e "require('./travel-subsidies.json')"`
3. 檢查終端錯誤訊息，根據提示修正

## 相關檔案

- **實作計畫**：`docs/plans/001-subsidy-application/SUBSIDY_IMPLEMENTATION_PLAN.md`
- **Excel 原始檔**：`docs/plans/001-subsidy-application/旅遊補助.xlsx`
- **同步工具說明**：`tools/subsidy-migration/README_SYNC.md`
- **午餐補助遷移**：`tools/subsidy-migration/README_MEAL.md`
- **進修課程遷移**：`tools/subsidy-migration/README_TRAINING.md`

## 完整工作流程範例

```bash
# 1. 啟動模擬器（在專案根目錄）
npm start

# 2. 切換到工具目錄
cd tools/subsidy-migration

# 3. Excel 轉 JSON
node excel-to-json.js "../../docs/plans/001-subsidy-application/旅遊補助.xlsx"

# 4. 解析資料
node travel-subsidy-parser.js 旅遊補助.json travel-subsidies.json

# 5. 查看解析結果（可選）
cat travel-subsidies.json | head -n 50

# 6. 執行遷移
node migrate-travel-subsidies.js travel-subsidies.json

# 7. 驗證結果（開啟瀏覽器）
open http://localhost:4000/firestore
```

## 資料統計範例

### 按旅遊類型統計

```bash
cat travel-subsidies.json | jq 'group_by(.travelType) | map({type: .[0].travelType, count: length, total: map(.amount) | add})'
```

輸出：
```json
[
  {
    "type": "員工旅遊",
    "count": 35,
    "total": 1156416
  },
  {
    "type": "個人旅遊",
    "count": 19,
    "total": 632610
  }
]
```

### 按員工統計

```bash
cat travel-subsidies.json | jq 'group_by(.userName) | map({user: .[0].userName, count: length, total: map(.amount) | add}) | sort_by(.total) | reverse'
```

## 更新日誌

### 當前版本
- ✅ 支援 M/D/YY 日期格式解析
- ✅ 自動判斷旅遊類型（員工旅遊、個人旅遊）
- ✅ 金額字串轉數字處理
- ✅ 過濾 null 記錄
- ✅ 使用者 ID 快取最佳化
- ✅ 詳細的統計資訊和摘要
- ✅ 完整的錯誤處理和報告
- ✅ 稽核軌跡記錄
