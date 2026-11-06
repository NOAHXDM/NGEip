# 功能規格：attendance 更新與審核權限

**功能分支**：`security/022-attendance-update-permission`
**建立日期**：2026-06-26
**狀態**：更新中
**輸入**：GitHub issue #22「security: 收斂 attendance 非附件欄位更新權限」；GitHub issue #34「用戶角色 user 修改申請單欄位及狀態相關報錯」

> 憲章要求：本文件 MUST 以繁體中文（zh-TW）撰寫，且僅記錄產品需求、使用者價值、驗收條件與成功標準。技術實作、Firestore 結構、安全規則與套件決策請寫入 plan.md。

## 文件範圍確認 *(mandatory)*

- 本文件聚焦「各角色對 attendance 申請可以做什麼」與「如何驗收權限邊界」，不含 Security Rules 語法。
- 範圍限定 `attendanceLogs` 文件的更新權限；不變更 subsidy 申請或既有讀取／建立／刪除語意。
- 名詞、錯誤訊息與使用者可見說明使用繁體中文。

## 後續規格與目前適用範圍

加班的核准資格已由 [014 加班通報人與核准權限](../014-overtime-callout-approval/spec.md) 收斂為通報人或 Admin，且必須待審、通報資料完整並獨立提交狀態變更。下文 issue #34 的全員核准敘述僅適用其他出勤類型；加班拒絕與退回待審仍開放所有登入者。

issue #38 已新增待審申請的代理人內容編輯權限，完整權限矩陣以 [010 代理人代改規格](../010-attendance-proxy-editing/spec.md) 為準。本文件保留 issue #22／#34 的背景，以下角色與驗收描述已納入此後續擴充。

## 背景與問題 *(mandatory)*

attendance 申請導入附件功能前，採用歷史權限模型：只要是已登入使用者，即使不是申請人本人或管理員，仍可透過 Firestore SDK 直接修改他人申請的非附件欄位（如 `reason`、`type`）。UI 限制不能取代資料邊界，形成越權修改風險。issue #22 因此要求收斂「內容與附件」更新權限。

issue #34 進一步確認產品語意：一般 `user` 角色可審核所有人的 attendance 申請，也就是可執行 `status` 轉換（`pending`、`approved`、`rejected` 之間），且 AnnualLeave 核准／退回待審時可連動調整申請人的剩餘特休時數。系統必須區分「狀態審核」與「內容/附件編輯」：前者開放所有已登入者，當時後者維持 owner pending 或 admin 邊界；後續 issue #38 另開放 pending 代理人編輯內容，但不開放代理人管理附件。

## 角色定義 *(mandatory)*

- **申請人（owner）**：`attendanceLogs.userId` 等於目前登入者。
- **管理員（admin）**：`users/{uid}.role == 'admin'`，可編輯任意 attendance 內容與附件。
- **一般審核者（authenticated user）**：任一已登入使用者，可變更任意 attendance 的 `status`。
- **代理人（proxy）**：申請指定的代理人，可在 pending 時編輯內容，但不可改派代理人、變更申請人或管理附件。
- **其他登入者（other）**：已登入但非該申請的 owner、代理人，也非 admin。
- **未登入者（anonymous）**：未通過 Firebase Authentication。

> 本專案目前未設獨立「審核者」角色；審核（status 轉換）權限歸屬所有已登入者。目前包含申請人自我核准，未依申請類型區分。若日後調整審核資格，需另立規格收斂。

## 權限矩陣 *(mandatory)*

下表列出原有角色；代理人的完整權限見 [010 權限矩陣](../010-attendance-proxy-editing/spec.md#權限矩陣)。矩陣描述資料存取權限；清單介面僅在 pending 提供編輯入口，Admin 也須先退回待審再由畫面編輯。

| 操作 | 申請人（pending） | 申請人（非 pending） | 管理員 | 其他登入者 | 未登入者 |
| --- | --- | --- | --- | --- | --- |
| 編輯內容欄位（reason/type/時間/時數等） | 允許 | 拒絕 | 允許 | 拒絕 | 拒絕 |
| 管理自己的附件 | 允許 | 拒絕 | 允許 | 拒絕 | 拒絕 |
| status 轉換（核准／拒絕／退回待審） | 允許 | 允許 | 允許 | 允許 | 拒絕 |
| AnnualLeave status 轉換連動剩餘特休時數 | 允許 | 允許 | 允許 | 允許 | 拒絕 |
| 變更 `userId`（轉移申請） | 拒絕 | 拒絕 | 允許 | 拒絕 | 拒絕 |

- 申請人只能在自己的申請仍為 `pending` 時編輯內容與附件，且不得在編輯動作中變更 `userId` 或 `status`。
- 所有已登入者可執行 status 轉換（含 `pending → approved`、`pending → rejected`、`approved/rejected → pending`），一般登入者的狀態更新只能改變 `status`，不得混入 `reason`、`type`、`userId`、`attachments` 等欄位異動；Admin 另有完整更新權限。
- AnnualLeave 從 `pending → approved` 時扣除申請人的剩餘特休時數；從 `approved → pending` 時補回。此餘額異動必須與同一筆 attendance status 轉換原子提交。
- 讀取（任何登入者可讀）、建立（依既有附件規則）、刪除（admin）權限維持不變。

## 使用者情境與測試 *(mandatory)*

### 使用者故事 1 - 申請人維護自己的待審申請 (Priority: P1)

申請人在自己的申請仍為待審（pending）時，可修改內容與附件以補正資料。

**驗收情境**：
1. **Given** 申請人有一筆 pending 申請，**When** 修改 reason 並儲存，**Then** 更新成功。
2. **Given** 申請已核准（approved），**When** 申請人嘗試修改內容或附件，**Then** 被拒絕；可先退回待審再編輯，或由管理員依其資料存取權限代辦。
3. **Given** 申請人有一筆 pending 申請，**When** 把 status 改為 approved，**Then** 更新成功，且不得同時修改其他內容欄位。

### 使用者故事 2 - 管理員審核與代辦 (Priority: P1)

管理員具備任意狀態的內容與附件更新權限；清單介面仍須先退回待審才能編輯。所有已登入者可審核與退回申請。

**驗收情境**：
1. **Given** 一筆 pending 申請，**When** 任一已登入者核准，**Then** status 轉為 approved；若為 AnnualLeave，並完成既有特休時數結算流程。
2. **Given** 任一狀態的申請，**When** 管理員編輯非附件欄位或退回待審，**Then** 更新成功。

### 使用者故事 3 - 阻擋越權修改 (Priority: P1)

其他登入者不得修改他人的申請內容或附件，但可單獨變更狀態；未登入者不得更新申請。

**驗收情境**：
1. **Given** 申請屬於他人，**When** 其他登入者嘗試修改 reason、type 或附件，**Then** 被拒絕。
2. **Given** 申請屬於他人，**When** 其他登入者只修改 status，**Then** 更新成功。
3. **Given** 任一申請，**When** 未登入者嘗試更新，**Then** 被拒絕。

## 驗收標準 *(mandatory)*

- 非 admin、非該筆申請代理人的其他登入者，只可跨使用者修改 attendance `status`；代理人僅可額外編輯 pending 申請的內容，不得管理附件、改派代理人或變更 `userId`。
- 所有允許的 status transition、AnnualLeave 餘額連動與可修改欄位均由 Firestore Security Rules 驗證，並有 Emulator 正向／負向矩陣覆蓋。
- 申請人於 pending 編輯自己申請的既有合法流程不得回歸。
- 不改變既有讀取、建立、刪除與附件治理語意。

## 來源

- GitHub issue #22
- GitHub issue #34
- 關聯：PR #19、PR #21、specs/005-request-attachments/plan.md。
