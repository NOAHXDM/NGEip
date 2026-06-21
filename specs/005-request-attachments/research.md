# Phase 0 研究紀錄：申請附件管理

**日期**：2026-06-19
**規格**：[spec.md](./spec.md)

## 1. 跨 Firestore 與 Storage 的一致性

**Decision**：採補償式工作流，並用 upload session 與 cleanup queue 確保每個實體檔始終有 Firestore reference。

**Rationale**：Firestore transaction 無法包含 Storage 上傳或刪除。治理文件可在兩個服務間提供明確中間狀態，失敗時可重試、稽核且不失去檔案歸屬。

**Alternatives considered**：只靠 client 立即補償刪除無法涵蓋瀏覽器關閉；先建立可見的 `uploading` 申請會污染列表；Cloud Functions 不在憲章允許範圍；固定 slot 路徑不適合多檔與新增後刪舊語意。

## 2. 附件 metadata 儲存方式

**Decision**：最多五筆 metadata 直接內嵌於 attendance/subsidy 申請文件。

**Rationale**：附件數量有嚴格小上限，隨申請讀取可避免每次 dialog 額外 query；transaction 可一次檢查最終數量與更新完整集合，既有查詢也不需新增 index。

**Alternatives considered**：subcollection 每次顯示多一次 query 且批次狀態較複雜；只在 Storage metadata 保存會迫使 UI 列舉 Storage。

## 3. 安全預覽方式

**Decision**：以 authenticated SDK `getBlob` 取得最多 3 MiB Blob，使用短生命週期 Object URL 預覽，不保存 `getDownloadURL`。

**Rationale**：download URL 含長效 token，取得後不會在每次讀取重新套用登入規則。Blob 讀取會經過 Storage Rules，Object URL 可在 dialog 關閉時撤銷。

**Alternatives considered**：永久 download URL 可能外流；base64 存 Firestore 會放大文件與讀取成本；原生 inline PDF 能力足夠，不需第三方 viewer。

## 4. 檔案格式驗證

**Decision**：官方 client 同時驗證副檔名、MIME、檔頭 magic bytes；Storage Rules 驗證 MIME allowlist 與大小。依使用者決策，本次接受 client-only 內容簽章驗證的殘餘風險。

**Rationale**：`accept` 只屬 UX 提示，`file.type` 亦可偽造。讀取前 12 bytes 即可辨識 PDF、JPEG、PNG、WebP。Storage Rules 無法檢查二進位內容，只能作第二層 MIME/size 邊界。

**Alternatives considered**：只檢查副檔名或 MIME 太容易誤判；完整解析檔案與病毒掃描超出本次範圍。

## 5. 替換與五檔上限

**Decision**：新增檔先上傳且由 session 持有，transaction 以「最新正式附件＋新檔－待刪檔」驗證最終最多五個；成功後才清舊檔。

**Rationale**：允許滿五檔時安全替換並符合「新檔失敗保留舊檔」。暫時第六個物件不等於第六個正式附件。

**Alternatives considered**：先刪舊檔會在新檔失敗時遺失原附件；滿五檔禁止新增不符合已確認需求。

## 6. 刪除順序與清理失敗

**Decision**：Firestore transaction 先把舊附件 reference 轉入 cleanup queue，再刪 Storage；成功後移除 queue。

**Rationale**：先刪實體可能留下壞 reference；先單純移除 metadata 可能留下真正孤兒。cleanup queue 讓檔案在等待或失敗時仍有明確歸屬。

**Alternatives considered**：先刪 Storage 破壞「批次失敗保持原狀」；先移除 metadata 後盡力刪檔在中斷時產生孤兒。

## 7. 並行編輯

**Decision**：正式提交附件變更時以 transaction 重讀 parent request，依 attachment ID 合併並驗證；衝突則中止並要求重新載入。

**Rationale**：使用表單初始快照直接覆寫 array 會遺失另一個使用者剛完成的附件異動。最多五筆的 ID set 合併成本低且可測試。

**Alternatives considered**：last-write-wins 可能靜默遺失附件；全域鎖增加逾時與鎖清理複雜度。

## 8. Rules 授權邊界

**Decision**：讀取為 signed-in；管理為 owner + pending 或 admin；新建代辦由 upload session 的 actor/owner/kind/path 契約授權，Storage 禁止 list 與 overwrite。

**Rationale**：UI 隱藏按鈕不能作安全邊界；parent request 與治理文件提供 Rules 可驗證的權限上下文。create-only 避免猜到 path 後覆寫既有附件。

**Alternatives considered**：所有登入者可 write 違反產品權限；只用 path ownerUid 無法驗證申請 status 或 admin 代辦。

## 9. 稽核資料內容

**Decision**：沿用各申請的 `auditTrail` subcollection，新增「新增附件」「刪除附件」動作，content 使用結構化 JSON 摘要，不保存 URL 或檔案內容。

**Rationale**：既有歷程 UI 與查詢模式可延伸；記錄 attachment ID、originalName、size、actor/time 足以查核又不暴露永久存取資訊。

**Alternatives considered**：全域附件 audit 集合增加額外權限與查詢；保留歷史實體檔違反需求。

## 10. 孤兒稽核

**Decision**：新增 Admin SDK dry-run 工具，將 Storage paths 與正式 attachments、sessions、cleanup queue 三方比對；破壞性模式需顯式旗標。

**Rationale**：client 補償仍可能因瀏覽器終止而延遲；可重跑、預設不刪的工具是符合現有專案模式的安全網。

**Alternatives considered**：依物件年齡自動刪除整個 prefix 可能誤刪正式附件；完全人工逐檔檢查容易遺漏。

## 11. Blob 預覽 CORS

**Decision**：以精確 origin allowlist 的 `storage.cors.json` 設定 production bucket，允許 Hosting 與本機開發來源執行 GET/HEAD；部署後由 Hosting origin smoke test。

**Rationale**：Firebase Web SDK `getBlob()` 要求 bucket whitelist 應用來源，Emulator 無法證明 production CORS 已套用。精確 origin 比 wildcard 更符合內部系統邊界，Storage Rules 仍負責 authenticated 授權。

**Alternatives considered**：改用 token download URL 會削弱每次 authenticated 讀取；只測 Emulator 會漏掉正式環境 CORS；wildcard origin 擴大不必要的跨來源存取面。
