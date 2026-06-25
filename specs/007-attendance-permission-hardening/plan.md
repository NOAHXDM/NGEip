# 實作計畫：收斂 attendance 更新權限

**功能分支**：`security/022-attendance-update-permission`
**對應規格**：`specs/007-attendance-permission-hardening/spec.md`
**來源**：GitHub issue #22

> 憲章要求：本文件記錄技術實作、Firestore 結構、安全規則、相容性與測試策略；產品需求與驗收標準請見 spec.md。

## 技術範圍

僅調整 `firestore.rules` 中 `attendanceLogs` 的 `allow update` 邊界，並補上對應 Emulator 測試矩陣。不變更 Angular 服務、元件或資料模型；附件上傳 session／cleanup queue／storage.rules 維持現狀。

## Security Rules 設計

新增輔助函數，將「申請人僅能在 pending 編輯自己申請」的不變量集中表達：

```
function attendanceOwnerEditable(existing, incoming, uid) {
  return existing.userId == uid
    && existing.status == 'pending'
    && incoming.userId == existing.userId
    && incoming.status == existing.status;
}
```

`attendanceLogs` 的 update 規則由原本的三段 OR：

```
!affectedKeys().hasAny(['attachments'])   // 任意登入者可改非附件欄位（風險來源）
  || isAdmin()
  || (owner && pending && userId/status 不變)
```

收斂為：

```
allow update: if isSignedIn() && validAttachmentCount(request.resource.data)
  && (isAdmin()
    || attendanceOwnerEditable(resource.data, request.resource.data, request.auth.uid));
```

關鍵差異：移除「`!affectedKeys().hasAny(['attachments'])` ⇒ 任意登入者可更新非附件欄位」分支。改為只有 admin 或 pending 狀態的 owner 可更新；status 轉換因 `incoming.status == existing.status` 限制而對 owner 關閉，僅 admin 可變更。

### 為何 status 轉換歸 admin 是相容的

`AttendanceService.updateStatus()`（核准／退回）對 `AnnualLeave` 會連帶寫入 `users/{userId}.remainingLeaveHours`。既有 `users` 規則僅允許 admin 或本人更新自己的非敏感欄位，因此「非 admin 替他人結算特休時數」在現行規則下早已失敗。將 attendance status 轉換收斂為 admin，與既有 users 規則一致，不擴大也不縮小實際可用的審核流程。

## 受影響檔案

- `firestore.rules`：新增 `attendanceOwnerEditable` 與改寫 attendance `allow update`。
- `tools/attendance-permission-emulator-tests.cjs`：新增權限矩陣測試。
- `package.json`：新增 `test:attendance-rules` script。
- `CHANGELOG.md`：記為 breaking security change。

## 相容性、資料遷移與部署順序

- **資料遷移**：無。僅變更存取規則，不改文件結構或既有資料。
- **kiosk／外部整合相容性**：attendance 讀寫已於先前版本收斂為需登入；本次再移除「任意登入者改非附件欄位」路徑。若有任何整合曾以非 owner／非 admin 身分修改他人申請欄位，部署後將被拒絕，必須改用 admin 帳號或申請人本人帳號。經檢視，現行 Angular 前端的編輯入口僅在 pending 顯示且實際寫入由 owner 或 admin 觸發，status 轉換流程亦依賴 users 規則的 admin 邊界，故前端不受影響。
- **部署順序**：Security Rules 可獨立於前端先行部署；無需資料前置遷移。建議先於 staging 以 Emulator 矩陣與手動審核流程驗證，再部署 production rules。

## 測試策略

- 以 `@firebase/rules-unit-testing` 建立 Emulator 正向／負向矩陣，至少涵蓋 owner（pending 可編輯內容／附件、不可自我核准、不可改 userId）、owner（非 pending 不可編輯）、admin（任意狀態可編輯與轉換 status）、other-user（任何欄位皆拒絕）、anonymous（拒絕）與 status transition。
- 既有 `tools/request-attachment-emulator-tests.cjs` 中「owner 於 pending 更新非附件欄位成功」的回歸案例必須維持通過。
- 執行方式：
  - `npm run test:attendance-rules`
  - `npm run test:attachment-rules`（回歸）

## 風險與緩解

- **風險**：若 production 曾存在非 owner／非 admin 的合法寫入路徑（未知整合），部署後會中斷。
  - **緩解**：CHANGELOG 標示為 breaking security change，部署前需確認無此類整合；必要時改以 admin 帳號操作。
