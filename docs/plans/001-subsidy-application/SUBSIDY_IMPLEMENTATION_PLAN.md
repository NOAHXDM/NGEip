# 員工補助申請及統計查詢功能實作計畫

## 概述

新增員工補助申請及統計查詢頁面,將 Google Excel 中的補助紀錄（除「公司資產」和「公費收支明細」外）整合到 EIP 系統中。

## 需處理的補助類型

| 補助類型 | 資料特性 | 功能需求 |
|---------|---------|---------|
| 個人筆電 | 36 期分期付款領取記錄 | 申請→審核，記錄每期領取 |
| 健檢補助 | 年度使用日期 | 申請→審核，記錄使用 |
| 進修課程 | 課程費用申請（50%補助） | 申請→審核 |
| AI 工具 | 季度申請（50%補助，上限2500/季） | 申請→審核 |
| 旅遊補助 | 年度金額（員旅/個人旅遊） | 申請→審核 |
| 供餐補助 | 每日點餐記錄（$150/日） | 記錄點餐、月度統計 |

---

## 一、Firestore 資料模型

### 新增集合

```
firestore/
├── subsidyApplications/        # 統一補助集合（筆電、健檢、進修、AI、旅遊）
│   └── {applicationId}/
│       ├── installments/       # 筆電的 36 期分期子集合（僅筆電補助使用）
│       └── auditTrail/         # 稽核軌跡子集合
├── mealSubsidies/              # 供餐補助原始資料（以日期為主）
│   └── {dateId}/               # 格式: YYYY-MM-DD
├── userMealStats/              # 使用者月度餐費統計（高效查詢）
│   └── {userId}_{YYYY-MM}/     # 複合 ID，每個使用者每月一筆
└── subsidyStats/               # 補助統計
```

### 關鍵介面定義

```typescript
// 補助類型
enum SubsidyType {
  Laptop = 1,       // 個人筆電
  HealthCheck = 2,  // 健檢
  Training = 3,     // 進修課程
  AITool = 4,       // AI 工具
  Travel = 5,       // 旅遊
}

// 補助狀態（不需要 disbursed）
enum SubsidyStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
}

// 通用補助申請介面
// 注意：子集合（installments, auditTrail）不在此介面中定義
// 因為 Firestore 子集合不是文件欄位，而是透過文件參照存取
interface SubsidyApplication {
  id?: string;
  userId: string;
  type: SubsidyType;
  status: SubsidyStatus;
  applicationDate: Timestamp;
  approvedAmount?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;

  // 通用欄位（各類型補助共用）
  content?: string;                 // 補助內容說明（如：課程名稱、旅遊地點等）
  invoiceAmount?: number;           // 發票金額（實際支出）
  // 注意：approvedAmount 即為申請金額（申請多少就核准多少）

  // AI 工具專用欄位
  quarter?: 1 | 2 | 3 | 4;          // 季度（僅 AI 工具使用）
  carryOverAmount?: number;         // 延至下一季金額（僅 AI 工具使用）
}

// 筆電分期領取記錄（子集合）
interface LaptopInstallment {
  id?: string;
  installmentNumber: number;        // 第幾期（1-36）
  receivedDate: Timestamp;
  amount: number;
  recordedBy: string;
  createdAt: Timestamp;
}

// 補助申請稽核軌跡（子集合）
interface SubsidyAuditTrail {
  id?: string;
  action: 'create' | 'update' | 'status_change';
  actionBy: string;
  actionDateTime: Timestamp;
  content?: string;                 // 變更內容的 JSON 字串
  previousStatus?: SubsidyStatus;
  newStatus?: SubsidyStatus;
}

// 供餐補助 - 每日餐點記錄（以日期為主，方便管理員查看）
interface DailyMealRecord {
  id?: string;                      // 格式：YYYY-MM-DD
  date: Timestamp;
  dayOfWeek: number;                // 1-5（週一到週五）
  meals: MealEntry[];
  dailyTotal: number;
  userIds: string[];                // 參與用餐的使用者 ID 陣列（用於查詢索引）
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface MealEntry {
  userId: string;
  orderContent: string;             // 點餐內容
  amount: number;                   // 餐費金額
}

// 使用者月度餐費統計（方便快速查詢個人用量）
interface UserMealStats {
  id?: string;                      // 格式：{userId}_{YYYY-MM}
  userId: string;
  yearMonth: string;                // 格式：YYYY-MM
  totalAmount: number;              // 月度總餐費
  mealCount: number;                // 用餐次數
  details: {
    date: string;                   // YYYY-MM-DD
    amount: number;
  }[];
  updatedAt: Timestamp;
}
```

---

## 二、服務層設計

### 新增服務檔案

```
src/app/services/
├── subsidy.service.ts              # 統一補助服務（筆電、健檢、進修、AI、旅遊）
├── meal-subsidy.service.ts         # 供餐補助服務（獨立）
└── subsidy-stats.service.ts        # 補助統計服務
```

### SubsidyService 核心方法

```typescript
// 參考 attendance.service.ts 模式
@Injectable({ providedIn: 'root' })
class SubsidyService {
  readonly typeList = [...];  // SubsidyType 選項

  // 查詢
  getMyApplications(userId: string): Observable<SubsidyApplication[]>
  getMyApplicationsByType(userId, type): Observable<SubsidyApplication[]>
  getPendingApplications(): Observable<SubsidyApplication[]>
  searchByTypeAndDate(type, startDate, endDate): Observable<SubsidyApplication[]>

  // CRUD
  create(application, userId): Observable<any>
  update(formValue, originValue): Observable<any>
  updateStatus(id, status, actionBy, approvedAmount?): Observable<any>

  // 筆電補助專用
  recordInstallment(applicationId, installmentNumber, recordedBy): Observable<void>
  getInstallments(applicationId): Observable<LaptopInstallment[]>

  // 稽核
  getAuditTrail(applicationId): Observable<SubsidyAuditTrail[]>
}
```

### MealSubsidyService 核心方法

```typescript
@Injectable({ providedIn: 'root' })
class MealSubsidyService {
  // 原始資料操作（以日期為主）
  getDailyMeal(dateId): Observable<DailyMealRecord>
  searchByDateRange(startDate, endDate): Observable<DailyMealRecord[]>
  saveDailyMeal(dateId, mealRecord): Observable<void>

  // 使用者統計查詢（高效查詢）
  getUserMonthlyStats(userId, yearMonth): Observable<UserMealStats>
  getUserYearlyStats(userId, year): Observable<UserMealStats[]>

  // 統計維護（寫入每日餐點時自動更新使用者月度統計）
  private updateUserMonthlyStats(userId, date, amount): Observable<void>
}
```

---

## 三、元件結構

### 新增元件

```
src/app/subsidy/
├── subsidy-list/                    # 補助申請列表
│   └── subsidy-list.component.ts    # Tab：我的申請/待審核/全部，可按類型過濾
├── subsidy-application/             # 申請對話框
│   └── subsidy-application.component.ts  # 根據 type 動態顯示不同表單欄位
├── subsidy-status-change/           # 狀態變更對話框
├── subsidy-history/                 # 稽核軌跡對話框
├── subsidy-stats/                   # 補助統計頁面
├── laptop-installment-dialog/       # 筆電領取記錄對話框
└── meal-subsidy/
    ├── meal-list/                   # 餐點列表（可按日期範圍查詢）
    ├── meal-form/                   # 每日點餐表單
    └── user-meal-stats/             # 使用者餐費統計（月度/年度）
```

### 新增 Pipes

```
src/app/pipes/
├── subsidy-type.pipe.ts             # 補助類型顯示（筆電、健檢、進修、AI、旅遊）
└── subsidy-status.pipe.ts           # 補助狀態顯示（待審核、已核准、已拒絕）
```

---

## 四、路由配置

修改 `src/app/app.routes.ts`：

```typescript
{
  path: 'Subsidy',
  children: [
    { path: '', redirectTo: 'List', pathMatch: 'full' },
    { path: 'List', loadComponent: () => SubsidyListComponent },       // 統一補助列表
    { path: 'Stats', loadComponent: () => SubsidyStatsComponent },     // 統計頁面
    { path: 'Meals', loadComponent: () => MealListComponent },         // 供餐列表
    { path: 'Meals/MyStats', loadComponent: () => UserMealStatsComponent }, // 個人餐費統計
  ],
}
```

---

## 五、安全規則更新

修改 `firestore.rules`：

```javascript
// 統一補助申請集合
match /subsidyApplications/{applicationId} {
  allow read: if isSignedIn();
  allow create: if isSignedIn();
  allow update: if isSignedIn() && (
    isAdmin() ||
    (resource.data.userId == request.auth.uid &&
     resource.data.status == 'pending')
  );
  allow delete: if isAdmin();

  // 筆電分期子集合
  match /installments/{installmentId} {
    allow read: if isSignedIn();
    allow create: if isAdmin();
  }

  // 稽核軌跡子集合
  match /auditTrail/{auditId} {
    allow read: if isSignedIn();
    allow create: if isSignedIn();
  }
}

// 供餐補助集合（原始資料）
match /mealSubsidies/{dateId} {
  allow read: if isSignedIn();
  allow write: if isAdmin();
}

// 使用者月度餐費統計
match /userMealStats/{statsId} {
  allow read: if isSignedIn() && (
    isAdmin() ||
    statsId.matches(request.auth.uid + '_.*')  // 使用者只能讀取自己的統計
  );
  allow write: if isAdmin();
}

// 補助統計
match /subsidyStats/{statsId} {
  allow read: if isSignedIn();
  allow write: if isAdmin();
}
```

---

## 六、資料遷移

### 遷移腳本

```
tools/subsidy-migration/
├── excel-to-json.js          # Excel 轉 JSON
├── migrate-laptop.js         # 筆電補助遷移
├── migrate-health-check.js   # 健檢補助遷移
├── migrate-training.js       # 進修課程遷移
├── migrate-travel.js         # 旅遊補助遷移
└── migrate-meals.js          # 供餐補助遷移
```

### 遷移順序
1. 先將 Excel 轉為 JSON 格式
2. 透過員工姓名匹配 Firestore 中的 userId
3. 使用 Firebase Admin SDK 批次寫入

---

## 七、實作順序

### 第一階段：基礎架構
1. 建立 `src/app/services/subsidy.service.ts` 資料模型和服務
2. 建立 `src/app/pipes/subsidy-type.pipe.ts` 和 `subsidy-status.pipe.ts`
3. 更新 `firestore.rules` 安全規則
4. 更新 `src/app/app.routes.ts` 路由配置
5. 更新 `src/app/layout/layout.component.ts` 導航選單

### 第二階段：統一補助功能
6. 實作 SubsidyListComponent（支援所有補助類型）
7. 實作 SubsidyApplicationComponent（根據類型動態顯示表單）
8. 實作 SubsidyStatusChangeComponent
9. 實作 SubsidyHistoryComponent
10. 實作 LaptopInstallmentDialog（筆電分期領取）

### 第三階段：供餐補助
11. 實作 MealSubsidyService
12. 實作 MealWeeklyListComponent
13. 實作 MealDailyFormComponent

### 第四階段：統計與遷移
14. 實作 SubsidyStatsService
15. 實作 SubsidyStatsComponent
16. 建立資料遷移腳本（Excel → JSON → Firestore）
17. 執行資料遷移

---

## 八、關鍵檔案參考

| 用途 | 參考檔案 |
|-----|---------|
| 服務模式 | `src/app/services/attendance.service.ts` |
| 列表元件 | `src/app/attendance/attendance-list/attendance-list.component.ts` |
| 表單對話框 | `src/app/attendance/attendance.component.ts` |
| 狀態變更 | `src/app/attendance/attendance-status-change/attendance-status-change.component.ts` |
| 路由配置 | `src/app/app.routes.ts` |
| 安全規則 | `firestore.rules` |

---

## 九、設計決策說明

### 9.1 SubsidyApplication 介面簡化

**問題**：原設計為每種補助類型定義專用欄位，導致介面過於複雜且大部分欄位對特定類型無意義。

**解決方案**：
- 移除筆電補助專用欄位（invoiceAmount, monthlyAmount, totalInstallments, completedInstallments）
  - 這些資訊改從 `installments` 子集合計算得出
- 移除健檢補助專用欄位（year, usedDate）
  - 使用 `applicationDate` 即可，無需額外欄位
- 使用通用 `content` 欄位取代特定類型的描述欄位（如 courseName）
- 保留 AI 工具的 `quarter` 和 `carryOverAmount`（業務邏輯需要）

**優點**：
- 介面更簡潔，易於維護
- 減少資料冗餘
- 更符合資料正規化原則

### 9.2 為什麼子集合不在介面中定義

**技術原因**：
在 Firestore 和 TypeScript 整合中：
- TypeScript 介面定義的是**文件本身的欄位**
- 子集合（subcollections）不是文件欄位，而是**獨立的集合路徑**
- 子集合透過文件參照（DocumentReference）存取：
  ```typescript
  const installmentsRef = collection(
    doc(firestore, 'subsidyApplications', applicationId),
    'installments'
  );
  ```

因此 `installments` 和 `auditTrail` 子集合有各自的介面定義（`LaptopInstallment`、`SubsidyAuditTrail`），但不會出現在 `SubsidyApplication` 介面中。

### 9.3 供餐補助雙層結構設計

**問題**：原設計以週為單位組織資料，查詢單一使用者月度統計時需要：
1. 計算月份包含哪些週
2. 查詢多個週的資料
3. 過濾出特定使用者的餐點
4. 累加金額

這樣的查詢效率不佳且複雜。

**解決方案 - 雙層結構**：

1. **原始資料層（mealSubsidies）**：以日期為主
   - 文件 ID：YYYY-MM-DD
   - 儲存每日所有員工的餐點記錄
   - 新增 `userIds` 陣列欄位作為索引
   - 適合管理員查看每日餐點狀況

2. **統計資料層（userMealStats）**：以使用者為主
   - 文件 ID：{userId}_{YYYY-MM}
   - 儲存每個使用者的月度統計
   - 包含 totalAmount、mealCount 和明細
   - 適合快速查詢個人月度用量

**維護策略**：
- 每次寫入/更新每日餐點時，自動更新相關使用者的月度統計
- 使用 Firestore 交易確保兩層資料的一致性

**優點**：
- 查詢個人月度統計：O(1) 單次文件讀取
- 查看每日餐點狀況：簡單的日期查詢
- 資料完整性：保留原始資料 + 計算統計資料
- 安全規則：使用者只能讀取自己的統計資料

---

### 9.4 金額欄位設計

**業務需求**：申請多少就核准多少（無需審核時調整金額）

**實際案例**：
- 員工參加進修課程，實際支出 10,000 元（發票金額）
- 根據公司規則「50% 補助」，員工申請 5,000 元
- 主管審核通過，核准金額即為 5,000 元（不會調整）

**欄位設計**：
```typescript
interface SubsidyApplication {
  invoiceAmount?: number;      // 發票金額（實際支出）
  approvedAmount?: number;     // 核准金額（= 申請金額）
}
```

**為什麼不需要 requestedAmount**：
- 申請金額 = 核准金額（申請多少就核准多少）
- 主管審核僅改變 status（approved/rejected），不調整金額
- 簡化欄位，避免資料冗餘

**前端輔助功能**：
- 表單可根據補助類型自動計算建議金額
- 例如：輸入發票金額 10,000 元，選擇「進修課程」，自動提示建議申請 5,000 元（50%）

### 9.5 補助申請編輯權限設計

**業務需求**：僅在 `pending` 狀態下，原申請者或審核者可以修改申請內容

**實際場景**：
- 員工送出補助申請後（pending），發現發票金額填錯，需要修正
- 管理員審核時（pending），發現申請內容有誤，直接協助修正
- 已核准/已拒絕的申請，維持資料完整性，不可再編輯

**設計方案**：共用 `SubsidyApplicationComponent` 進行編輯

**權限規則**：
```typescript
// 「我的申請」Tab - 原申請者
- 可編輯：僅自己 status = 'pending' 的申請
- 編輯按鈕：僅在 pending 狀態顯示

// 「全部申請」Tab - 管理員
- 可編輯：僅 status = 'pending' 的申請
- 編輯按鈕：僅在 pending 狀態且為管理員時顯示

// 「待審核」Tab - 管理員
- 可編輯：所有待審核申請（本 Tab 都是 pending）
- 編輯按鈕：永遠顯示（方便快速修正後審核）
```

**元件複用**：
- 編輯模式：傳入 `{ title: 'Edit Subsidy Application', application }`
- 新增模式：傳入 `{ title: 'New Subsidy Application' }`
- 表單驗證、欄位顯示邏輯完全相同
- 更新後自動記錄稽核軌跡（auditTrail）

**為什麼僅限制 pending 狀態可編輯**：
1. 資料穩定性：已核准/已拒絕的申請應維持不變
2. 稽核完整性：避免事後修改已審核記錄
3. 重新申請機制：若需修正已審核記錄，應重新申請
4. 權限清晰：僅待審核階段可修正錯誤

**注意事項**：
- 編輯後會更新 `updatedAt` 時間戳記
- 所有變更記錄在 `auditTrail` 子集合
- 狀態變更仍透過 `SubsidyStatusChangeComponent` 進行
- 已核准/已拒絕的申請若需修正，應重新提交新申請

---

## 十、待確認事項

1. ~~流程類型~~（已確認：所有過往申請審核紀錄都需紀錄到對應申請人）
2. ~~個人筆電欄位意義~~（已確認：分期付款領取日）
3. ~~供餐補助用途~~（已確認：個人餐費補助）
4. ~~公費收支明細~~（已確認：暫不處理）
5. ~~金額欄位設計~~（已確認：發票金額 + 核准金額，無需申請金額）
6. ~~補助申請編輯權限~~（已確認：僅 pending 狀態可編輯，原申請者和管理員皆可，共用 SubsidyApplicationComponent）
7. ~~供餐補助欄位~~（已確認：移除 restaurantName，僅記錄日期和金額）
