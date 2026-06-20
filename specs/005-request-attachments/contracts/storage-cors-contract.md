# Storage CORS 契約：附件 Blob 預覽

## 目的

Firebase Web SDK `getBlob()` 會直接從 Cloud Storage bucket 讀取資料，production bucket 必須允許應用程式來源的跨來源 GET/HEAD。CORS 不是授權機制；登入與物件讀取權限仍由 Storage Rules 驗證。

## 設定檔

實作時新增根目錄 `storage.cors.json`：

```json
[
  {
    "origin": [
      "https://noahxdm-eip.web.app",
      "https://noahxdm-eip.firebaseapp.com",
      "http://localhost:4200"
    ],
    "method": ["GET", "HEAD"],
    "responseHeader": [
      "Content-Type",
      "Content-Length",
      "Content-Range"
    ],
    "maxAgeSeconds": 3600
  }
]
```

若 production Hosting 使用額外 custom domain，必須在上線前加入精確 origin；不得使用 `*`。

`http://localhost:4200` 僅為開發與正式 bucket smoke test 保留。它會允許該 origin 發出跨來源 GET／HEAD，但不會繞過 Firebase Authentication 與 Storage Rules；若未來不允許本機驗證正式附件，應從 allowlist 移除此 origin。

## 部署

Firebase CLI 不會隨 `firebase deploy` 套用 bucket CORS。使用：

```bash
gcloud storage buckets update gs://noahxdm-eip.firebasestorage.app \
  --cors-file=storage.cors.json
```

## 驗證

1. 從 Firebase Hosting 正式 origin 登入。
2. 開啟任一圖片與 PDF 附件，確認 `getBlob()` 成功且 response 含正確 `Access-Control-Allow-Origin`。
3. 從未列入 allowlist 的 origin 呼叫時，瀏覽器必須阻擋。
4. 登出後即使 origin 合法，Storage Rules 仍必須拒絕附件讀取。
5. Emulator 測試不能取代正式 bucket CORS smoke test。
