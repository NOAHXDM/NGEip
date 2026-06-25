# 功能規格：收斂 attendance 更新權限

**功能分支**：`security/022-attendance-update-permission`
**建立日期**：2026-06-26
**狀態**：草稿
**輸入**：GitHub issue #22「security: 收斂 attendance 非附件欄位更新權限」

> 憲章要求：本文件 MUST 以繁體中文（zh-TW）撰寫，且僅記錄產品需求、使用者價值、驗收條件與成功標準。技術實作、Firestore 結構、安全規則與套件決策請寫入 plan.md。

## 文件範圍確認 *(mandatory)*

- 本文件聚焦「各角色對 attendance 申請可以做什麼」與「如何驗收權限邊界」，不含 Security Rules 語法。
- 範圍限定 `attendanceLogs` 文件的更新權限；不變更 subsidy 申請或既有讀取／建立／刪除語意。
- 名詞、錯誤訊息與使用者可見說明使用繁體中文。

## 背景與問題 *(mandatory)*

attendance 申請導入附件功能前，採用歷史權限模型：只要是已登入使用者，即使不是申請人本人或管理員，仍可透過 Firestore SDK 直接修改他人申請的非附件欄位（如 `status`、`reason`、`type`）。UI 雖未提供入口，但 UI 限制不能取代資料邊界，形成越權修改風險。依專案憲章 Governance，不得將既有偏差視為默認標準，必須以明確規格收斂。

## 角色定義 *(mandatory)*

- **申請人（owner）**：`attendanceLogs.userId` 等於目前登入者。
- **管理員（admin）**：`users/{uid}.role == 'admin'`，負責審核與代辦。
- **其他登入者（other）**：已登入但非該申請的 owner，也非 admin。
- **未登入者（anonymous）**：未通過 Firebase Authentication。

> 本專案目前未設獨立「審核者」角色；審核（status 轉換）權限歸屬 admin。若日後新增審核者角色，需另立規格擴充。

## 權限矩陣 *(mandatory)*

| 操作 | 申請人（pending） | 申請人（非 pending） | 管理員 | 其他登入者 | 未登入者 |
| --- | --- | --- | --- | --- | --- |
| 編輯內容欄位（reason/type/時間/時數等） | 允許 | 拒絕 | 允許 | 拒絕 | 拒絕 |
| 管理自己的附件 | 允許 | 拒絕 | 允許 | 拒絕 | 拒絕 |
| status 轉換（核准／拒絕／退回待審） | 拒絕 | 拒絕 | 允許 | 拒絕 | 拒絕 |
| 變更 `userId`（轉移申請） | 拒絕 | 拒絕 | 允許 | 拒絕 | 拒絕 |

- 申請人只能在自己的申請仍為 `pending` 時編輯內容與附件，且不得在編輯動作中變更 `userId` 或 `status`。
- 所有 status 轉換（含 `pending → approved`、`pending → rejected`、`approved/rejected → pending`）一律由 admin 執行，避免申請人自我核准或其他登入者越權審核。
- 讀取（任何登入者可讀）、建立（依既有附件規則）、刪除（admin）權限維持不變。

## 使用者情境與測試 *(mandatory)*

### 使用者故事 1 - 申請人維護自己的待審申請 (Priority: P1)

申請人在自己的申請仍為待審（pending）時，可修改內容與附件以補正資料。

**驗收情境**：
1. **Given** 申請人有一筆 pending 申請，**When** 修改 reason 並儲存，**Then** 更新成功。
2. **Given** 申請已核准（approved），**When** 申請人嘗試修改內容或附件，**Then** 被拒絕，需由管理員代辦。
3. **Given** 申請人有一筆 pending 申請，**When** 嘗試把 status 改為 approved（自我核准），**Then** 被拒絕。

### 使用者故事 2 - 管理員審核與代辦 (Priority: P1)

管理員可在任何狀態下審核、編輯與退回申請。

**驗收情境**：
1. **Given** 一筆 pending 申請，**When** 管理員核准，**Then** status 轉為 approved 並完成既有特休時數結算流程。
2. **Given** 任一狀態的申請，**When** 管理員編輯非附件欄位或退回待審，**Then** 更新成功。

### 使用者故事 3 - 阻擋越權修改 (Priority: P1)

其他登入者與未登入者不得修改不屬於自己的申請。

**驗收情境**：
1. **Given** 申請屬於他人，**When** 其他登入者嘗試修改 reason、type、status 或附件，**Then** 全部被拒絕。
2. **Given** 任一申請，**When** 未登入者嘗試更新，**Then** 被拒絕。

## 驗收標準 *(mandatory)*

- 任意已登入使用者不可修改不屬於自己的 attendance 文件，除非其角色（admin）在本規格中明確獲授權。
- 所有允許的 status transition 與可修改欄位均由 Firestore Security Rules 驗證，並有 Emulator 正向／負向矩陣覆蓋。
- 申請人於 pending 編輯自己申請的既有合法流程不得回歸。
- 不改變既有讀取、建立、刪除與附件治理語意。

## 來源

- GitHub issue #22
- 關聯：PR #19、PR #21、specs/005-request-attachments/plan.md。
