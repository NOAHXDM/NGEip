# Quickstart：申請附件驗證

## 前置條件

- 專案依賴已安裝，Firebase Emulator 可使用 Auth、Firestore、Storage。
- 準備兩個一般使用者與一個 admin 測試帳號。
- 準備 PDF、JPEG、PNG、WebP，各一份；另準備 3 MiB、3 MiB + 1 byte、錯誤副檔名與偽造 MIME 檔案。
- production 驗證需可使用 `gcloud` 更新 `gs://noahxdm-eip.firebasestorage.app` CORS。

## 啟動與測試

```bash
npm start
npm test -- --watch=false
```

Rules 測試須覆蓋 [Firestore contract](./contracts/firestore-rules-contract.md) 與 [Storage contract](./contracts/storage-rules-contract.md) 的必測案例。

## Production CORS

依 [Storage CORS contract](./contracts/storage-cors-contract.md) 建立 `storage.cors.json` 後套用：

```bash
gcloud storage buckets update gs://noahxdm-eip.firebasestorage.app \
  --cors-file=storage.cors.json
```

此設定不會由 `firebase deploy` 自動完成。必須從正式 Hosting origin 登入並預覽圖片/PDF，確認 `getBlob()` 成功；未列入 allowlist 的 origin 與未登入使用者仍須被阻擋。

## 手動驗收

### 1. Attendance 新增

1. 一般使用者 A 登入並新增 attendance，不選附件直接儲存，確認原流程成功。
2. 再建立一筆，選 PDF、JPEG、PNG、WebP 共四檔。
3. 送出後重新開啟，確認名稱、大小與預覽正確。
4. 取消已選檔但未送出的 dialog，確認沒有遠端物件。

### 2. Subsidy 與全有或全無

1. 建立 subsidy 並選五個合法檔案，確認成功。
2. 選四個合法檔與一個超過 3 MiB 檔，確認送出前拒絕。
3. 模擬第三檔上傳失敗，確認申請未建立，已上傳檔被補償或仍由 cleanup-pending session 持有。

### 3. 五檔替換

1. 開啟已有五檔的 pending 申請。
2. 標記一個舊檔刪除，再新增新檔。
3. 確認 UI 接受最終數量五，且新檔成功前舊檔仍可預覽。
4. 模擬新檔失敗，確認舊檔與原 metadata 不變。
5. 成功重試，確認最終仍為五檔，舊檔進入清理並留下刪除 audit。

### 4. 權限

1. 使用者 B 開啟 A 的申請：可預覽，不可新增或刪除。
2. A 開啟自己的 pending：可管理。
3. 將申請改為 approved/rejected：A 不可管理。
4. admin 在三種狀態皆可管理，audit actionBy 為 admin UID。
5. 登出後重用既有畫面或路徑：附件讀取被拒。
6. 確認本功能沒有新增列表層級的「查看附件」入口，也沒有新增 subsidy-list 對 approved/rejected 的編輯入口。

### 5. 審核 dialog

1. 分別開啟 attendance 與 subsidy 狀態變更 dialog。
2. 確認圖片與 PDF 可預覽，載入失敗有繁體中文提示。
3. 關閉或切換預覽，確認 Blob URL 已釋放。

### 6. 並行編輯

1. 以兩個視窗開啟同一 pending 申請。
2. 視窗一新增附件並儲存。
3. 視窗二依舊快照嘗試異動，確認被拒並提示重新載入，不覆蓋視窗一結果。

## 孤兒稽核

預設只回報：

```bash
npm run audit:request-attachments
```

輸出須區分正式附件、session 持有檔案、cleanup queue 持有檔案、真正孤兒與破損 reference。

只有明確確認後使用破壞性旗標：

```bash
node tools/request-attachment-orphan-audit.js --delete-orphans
node tools/request-attachment-orphan-audit.js --process-cleanup
```

工具預設不修改任何資料；執行前需提供 `GOOGLE_APPLICATION_CREDENTIALS`，並以按需或本機方式提供 `firebase-admin`。

## 實作驗證紀錄（2026-06-20）

- `npm test -- --watch=false --browsers=ChromeHeadless`：217 passed、68 skipped；skipped 為既有 suites，附件核心合併／衝突／部分上傳補償、清單事件及儲存中 dialog 鎖定均由可執行單元測試覆蓋。
- `npm run build`：production bundle 成功。
- `npm run test:attachment-rules`：Firestore/Storage Emulator 權限矩陣通過，涵蓋完整 session → Storage → parent/audit → session delete 工作流、owner、other-user、admin 代辦、unauthenticated、pending/approved、五檔上限、跨 session 注入拒絕、cleanup owner 防偽、缺欄位 queue 不得授權刪除、non-batch queue create 拒絕、MIME/size、list deny、overwrite deny 與 avatar 回歸。
- Rules 測試曾發現同一路徑 upload 可被視為 create；加入 `resource == null` 後確認 overwrite 被拒。
- `npm run test:attachment-audit`：純分類 dry-run 測試通過。
- `npm run audit:request-attachments:local`：fixture dry-run 為 formal=1、session=1、cleanup=1、orphan=0、broken reference=0。
- 本機 Browser smoke：attendance 與 subsidy 新增 dialog 均顯示「附件（0/5）」、選檔鍵盤按鈕、四格式/3 MiB 提示；subsidy list 沒有獨立附件入口，也沒有新增任意狀態編輯入口。
- 圖片/PDF/fallback/Object URL、owner/admin 三狀態與五換五由元件單元測試驗證；正式跨 origin CORS 留待發佈前驗收。
- Production CORS 已套用至 `gs://noahxdm-eip.firebasestorage.app`。以 `https://noahxdm-eip.web.app` origin 對正式物件執行 authenticated Range GET，回應為 `206`、`Access-Control-Allow-Origin` 正確且具有 `Content-Range`；相同未登入請求回應 `403`。

### 查詢與治理成本

- 附件 metadata 隨 parent request 既有 query 回傳，列表不新增 Firestore query。
- 預覽使用 authenticated `getBlob()` 並設定 3 MiB 最大下載量；Storage cache 為 `private,max-age=3600`。
- 新增含附件會增加一筆短期 upload session 與附件 audit；成功 commit 後刪除 session。
- 刪除每檔增加一筆 cleanup queue 與刪除 audit，實體檔清除成功後移除 queue；失敗可安全重跑。

完成正常流程與補償後，真正孤兒數必須為 0。

## 回歸檢查

- 舊 attendance/subsidy 文件沒有 attachments 仍可顯示及編輯。
- attendance 特休核准/退回時數 transaction 不受影響。
- attendance 既有非附件建立、編輯與狀態操作角色不因附件 Rules 改變，但未登入存取必須被拒絕。
- subsidy 核准金額與筆電分期不受影響。
- 既有 avatars Storage Rules 與頭像功能維持正常。
