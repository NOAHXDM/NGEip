# 實作計畫：出勤申請代理人代改（GitHub issue #38）

## 架構決策

### 單一權限判斷來源

issue #38 的根因是 UI 與 Security Rules 的權限判斷各寫各的。修法建立
`src/app/utils/attendance-permission.ts` 作為前端唯一來源，四個函式與 `firestore.rules`
一對一對應：

| 前端函式 | rules 對應 |
| --- | --- |
| `canEditAttendance()` | `attendanceContentEditable()` 或 `isAdmin()` |
| `canReassignAttendanceProxy()` | `attendanceContentEditable()` 的 `proxyUserId` 不變量 |
| `canChangeAttendanceRequester()` | `attendanceContentEditable()` 的 `userId` 不變量 |
| `canManageAttendanceAttachments()` | `validUploadSessionParent()` 與附件 auditTrail 條件 |

任一側調整都必須同步另一側，否則會再次開放出 rules 會拒絕的入口。

### Firestore Rules

`attendanceOwnerEditable()` 改名為 `attendanceContentEditable()`，判斷式改為：

- 申請必須為 `pending`，且 `userId`、`status` 不得變更（沿用既有不變量）。
- 通過者為「申請人本人」或「代理人本人」。
- 代理人分支額外要求 `proxyUserId` 與 `attachments` 不得變更。

`proxyUserId` 一律以 `data.get('proxyUserId', '')` 讀取。舊文件可能沒有這個欄位，
直接存取會觸發 evaluation error 使合法更新被誤拒；uid 永不為空字串，
因此空預設值不會意外匹配到任何人。

代理人被禁止改派代理人，是因為代理人若能改派，等同可把編輯權轉發給任意第三方，
形成不受申請人控制的授權鏈。

`attachments` 在文件上只是一個欄位，放寬內容編輯權後代理人即可直接改寫該陣列並孤兒化他人檔案。
因此在 rules 內明確鎖住，與附件的 upload session 規則鏈維持一致邊界。

### 表單欄位鎖定

停用的 Angular 控制項不會出現在 `FormGroup.value`，因此不會進入 `AttendanceService.diff()`
產生的 patch。這讓「UI 鎖定」與「rules 不變量」自然對齊：使用者改不到的欄位也不會被送出，
不會因為送出 rules 不允許的欄位而觸發拒絕。

### 錯誤訊息

`AttachmentService.updateErrorMessage()` 新增 `permission-denied` 分支，
沿用既有的 `attachmentErrorCode()` 取 `FirebaseError.code`。
此方法由 attendance 與 subsidy 共用，文案維持通用（「這筆申請」）。

### 跨欄位驗證

`attendanceDateTimeOrderValidator` 掛在 FormGroup 層級並具名匯出以便單獨測試。
兩側皆為合法 `Date` 時才判定，避免表單開啟時（初始值為空字串）立即報錯。
這是 UX 層防護，繞過 SDK 直接寫入仍可通過；rules 未加對應驗證，屬已知取捨。

## 變更檔案

- `firestore.rules`：`attendanceProxyUid()`、`attendanceContentEditable()`
- `src/app/utils/attendance-permission.ts`（新增）
- `src/app/attendance/attendance-list/attendance-list.component.{ts,html}`：`canEdit()` 收斂編輯入口
- `src/app/attendance/attendance.component.{ts,html}`：欄位鎖定、跨欄位驗證、附件權限改用共用函式
- `src/app/services/attachment.service.ts`：`permission-denied` 訊息分支

## 測試策略

- 單元測試：`attendance-permission.spec.ts` 覆蓋四個函式的身分 × 狀態矩陣與欄位缺漏；
  `attendance.component.spec.ts` 覆蓋驗證器與三種身分的欄位鎖定。
- Rules 測試：`tools/attendance-permission-emulator-tests.cjs` 第 14–22 項覆蓋代理人正負向、
  改派後失效、非 pending 不可編輯、舊文件缺欄位不得誤拒。
- 既有 spec 中把開始與結束時間設為同一個 `new Date()` 的退化資料已改為真實區間。

## 部署順序

Security Rules 必須先於前端部署。本次為放寬權限，順序顛倒會讓代理人看得到編輯入口卻寫入失敗，
正好重現 issue #38 的症狀。

## 資料遷移

無。`proxyUserId` 已存在於既有資料模型，rules 以帶預設值的取法相容缺欄位的舊文件。
