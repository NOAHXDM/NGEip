# 實作計畫：attendance 更新與審核權限

**功能分支**：`security/022-attendance-update-permission`
**對應規格**：`specs/007-attendance-permission-hardening/spec.md`
**來源**：GitHub issue #22、GitHub issue #34

> 憲章要求：本文件記錄技術實作、Firestore 結構、安全規則、相容性與測試策略；產品需求與驗收標準請見 spec.md。

## 技術範圍

調整 `firestore.rules` 中 `attendanceLogs` 的 `allow update` 邊界，並補上對應 Emulator 測試矩陣。issue #34 確認一般 `user` 可審核所有 attendance，因此 `status` 轉換由任一已登入者執行；內容欄位與附件仍維持 owner pending 或 admin。AnnualLeave 的 `pending -> approved` / `approved -> pending` 需允許一般 user 在同一 transaction 內調整申請人的 `remainingLeaveHours`。

附件上傳 session／cleanup queue／storage.rules 維持現狀；一般 user 可審核 status 不代表可替他人新增、刪除或替換附件。

## Security Rules 設計

保留輔助函數，將「申請人僅能在 pending 編輯自己申請」的不變量集中表達：

```
function attendanceOwnerEditable(existing, incoming, uid) {
  return existing.userId == uid
    && existing.status == 'pending'
    && incoming.userId == existing.userId
    && incoming.status == existing.status;
}
```

新增 `attendanceStatusEditable(existing, incoming)`，只允許 `status` 單一欄位變更，且 `userId` 必須保持不變：

```
incoming.userId == existing.userId
  && incoming.status in ['pending', 'approved', 'rejected']
  && incoming.status != existing.status
  && incoming.diff(existing).affectedKeys().hasOnly(['status'])
```

`attendanceLogs` 的 update 規則改為：

```
allow update: if isSignedIn() && validAttachmentCount(request.resource.data)
  && (isAdmin()
    || attendanceOwnerEditable(resource.data, request.resource.data, request.auth.uid)
    || attendanceStatusEditable(resource.data, request.resource.data));
```

關鍵差異：

- 移除「任意登入者可更新非附件欄位」的歷史寬鬆分支。
- status 轉換改為所有已登入者可執行，但僅限單獨變更 `status`。
- 內容欄位、附件與 `userId` 仍只允許 admin 或 pending owner。

### AnnualLeave 特休餘額連動

`AttendanceService.updateStatus()` 對 `AnnualLeave` 會連帶寫入 `users/{userId}.remainingLeaveHours`。issue #34 確認一般 user 可審核所有人的 attendance，且允許連動調整對方剩餘特休時數；因此 Firestore Rules 需要一個可驗證的關聯欄位，而不是開放任意 cross-user 修改 users 文件。

`AttendanceService.updateStatus()` 在更新 `remainingLeaveHours` 時同步寫入：

```
lastAttendanceLeaveAdjustmentId: data.id
lastAttendanceLeaveAdjustmentBy: actionBy
```

`users/{userId}` update 僅在下列條件放行一般 user cross-user 餘額異動：

- affected keys 只包含 `remainingLeaveHours`、`lastAttendanceLeaveAdjustmentId`、`lastAttendanceLeaveAdjustmentBy`
- `lastAttendanceLeaveAdjustmentBy == request.auth.uid`
- 同一 transaction 中 `getAfter(attendanceLogs/{lastAttendanceLeaveAdjustmentId})` 存在且 `userId` 指向同一使用者
- 該 attendance 為 AnnualLeave（`type == 4`）
- 前後 status 為 `pending -> approved` 且餘額扣除 `hours`，或 `approved -> pending` 且餘額補回 `hours`

此設計避免一般 user 直接任意調整他人特休餘額，同時支援產品要求的審核流程。

## 受影響檔案

- `firestore.rules`：新增 `attendanceStatusEditable`、`isAttendanceLeaveAdjustment` 與改寫 attendance/users `allow update`。
- `src/app/services/attendance.service.ts`：AnnualLeave 餘額異動寫入 rules 可驗證的關聯欄位；一般欄位更新成功後回傳明確成功值。
- `src/app/attendance/attendance.component.ts`：更新成功訊息不再因 `void` 回傳誤顯示「No changes」。
- `tools/attendance-permission-emulator-tests.cjs`：新增權限矩陣測試。
- `package.json`：新增 `test:attendance-rules` script。
- `CHANGELOG.md`：記為 breaking security change。

## 相容性、資料遷移與部署順序

- **資料遷移**：無。僅變更存取規則，不改文件結構或既有資料。
- **kiosk／外部整合相容性**：attendance 讀寫已於先前版本收斂為需登入；本次再移除「任意登入者改非附件欄位」路徑。若有任何整合曾以非 owner／非 admin 身分修改他人申請內容欄位，部署後將被拒絕。僅 `status` 單欄位跨使用者變更維持開放。
- **資料相容性**：`lastAttendanceLeaveAdjustmentId` 與 `lastAttendanceLeaveAdjustmentBy` 為審核時新增的輔助欄位，既有 user 文件可缺省；只有 AnnualLeave status 連動餘額時會寫入。
- **部署順序**：Security Rules 可獨立於前端先行部署；無需資料前置遷移。建議先於 staging 以 Emulator 矩陣與手動審核流程驗證，再部署 production rules。

## 測試策略

- 以 `@firebase/rules-unit-testing` 建立 Emulator 正向／負向矩陣，至少涵蓋 owner（pending 可編輯內容／附件、可轉換 status、不可改 userId）、owner（非 pending 不可編輯內容／附件）、admin（任意狀態可編輯與轉換 status）、other-user（可轉換 status、不可修改內容/附件）、anonymous（拒絕）、AnnualLeave cross-user 餘額連動，以及非法餘額調整拒絕。
- 既有 `tools/request-attachment-emulator-tests.cjs` 中「owner 於 pending 更新非附件欄位成功」的回歸案例必須維持通過。
- 執行方式：
  - `npm run test:attendance-rules`
  - `npm run test:attachment-rules`（回歸）

## 風險與緩解

- **風險**：若 production 曾存在非 owner／非 admin 的合法寫入路徑（未知整合），部署後會中斷。
  - **緩解**：CHANGELOG 標示為 breaking security change，部署前需確認無此類整合；必要時改以 admin 帳號操作。
