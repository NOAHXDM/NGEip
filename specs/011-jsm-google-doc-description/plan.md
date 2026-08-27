# 實作計畫：JSM 留言同步 Google Docs 純文字至描述

## 架構決策

採用一支 Cloud Functions for Firebase 2nd gen HTTPS Function：

```text
Jira 公開留言
  → Jira Automation 擷取 Google Docs URL
  → POST getGoogleDocPlainText（等待回應）
  → Function 驗證呼叫者與輸入
  → Google Docs API documents.get（唯讀）
  → 重現 n8n simple output
  → Jira Automation Edit issue description
```

Function 不接收 Jira API credential、不呼叫 Jira REST API、不寫 Firestore。Jira Automation 已具有
目前 issue context 與修改權限，由它完成最後一步可減少一組長期憑證、失敗補償與重複寫入問題。

## Function 定義

| 設定 | 值 | 理由 |
| --- | --- | --- |
| Export name | `getGoogleDocPlainText` | 名稱只描述讀取與轉換，不暗示會修改 Jira |
| Generation | 2nd gen `onRequest` | Jira 使用一般 HTTPS webhook |
| Region | `asia-east1` | 沿用專案全域設定；本功能沒有 Firestore 跨區存取 |
| Runtime | Node.js 22 | 與 Functions workspace 一致 |
| Timeout | 30 秒 | 讓 Jira 同步等待，同時避免上游請求長時間占用 instance |
| Memory | 256 MiB | 僅處理單一 Docs JSON 與字串 |
| Min instances | 0 | 低頻內部操作，不為冷啟動支付常駐成本 |
| Max instances | 3 | 限制異常流量的成本與 Google Docs API 壓力 |
| Concurrency | 10 | 單次主要是 I/O；低於平台預設值以限制同 instance 記憶體放大 |
| CORS | 關閉 | 呼叫者是 Jira server，不是瀏覽器 |
| Platform invoker | Public | Jira Automation 無法簽發 Google Cloud ID token；另做應用層驗證 |

平台允許 unauthenticated invocation 只代表請求能到達 handler，不代表通過應用授權。handler 必須先驗證
shared secret，通過後才解析與查詢文件。

## HTTP 契約 v1

### Request

```http
POST /getGoogleDocPlainText
Content-Type: application/json
X-NGEIP-Webhook-Token: <JIRA_DOC_WEBHOOK_TOKEN>
```

```json
{
  "docUrl": "https://docs.google.com/document/d/DOCUMENT_ID/edit",
  "issueKey": "DMIT-1234"
}
```

- `docUrl`：必填。必須是 HTTPS、hostname 恰為 `docs.google.com`，path 必須符合
  `/document/d/{documentId}`；query 與 fragment 可存在但不參與文件讀取。
- `issueKey`：必填，只用於 structured log 關聯，不作為授權依據，也不回傳給 Google。
- 不接受 raw document ID，避免把任意字串誤當有效資源。
- 驗證 URL 後只抽出 document ID，實際連線位置固定為 Google Docs API，因此使用者輸入不會成為
  server-side fetch URL。

使用自訂 header 而不是 `Authorization`，避免與 Cloud Run／Functions 平台的 Bearer ID token 語意衝突。
Jira Automation 中該 header 必須標成 hidden value。

### Success response

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
```

```json
{
  "source": "https://docs.google.com/document/d/DOCUMENT_ID/edit",
  "documentId": "DOCUMENT_ID",
  "revisionId": "LATEST_REVISION_ID",
  "content": "第一段\n第二段\n",
  "contentHash": "sha256:..."
}
```

- `source` 保留驗證後、去除前後空白的原始 URL，供 Jira description 第一行使用。
- `content` 是與 n8n simple output 相容的字串。
- `revisionId` 在 Google Docs API 未提供時為 `null`。
- `contentHash` 是 UTF-8 `content` 的 SHA-256；第一版只供追蹤與未來 no-op 判斷，Jira 不需保存。
- 回應不包含 Google access token、文件標題或完整 Docs API payload。

### Error response

```json
{
  "error": {
    "code": "DOC_ACCESS_DENIED",
    "message": "Function 無法讀取指定的 Google Docs 文件。",
    "requestId": "..."
  }
}
```

| HTTP status | Error code | 情境 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | JSON shape、`docUrl` 或 `issueKey` 不合法 |
| 401 | `UNAUTHORIZED` | webhook token 缺少或不符 |
| 404 | `DOC_NOT_FOUND` | Google Docs API 回覆文件不存在 |
| 403 | `DOC_ACCESS_DENIED` | Google identity 沒有該文件讀取權限 |
| 405 | `METHOD_NOT_ALLOWED` | 非 POST；回覆 `Allow: POST` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | 非 `application/json` |
| 429 | `UPSTREAM_RATE_LIMITED` | Google Docs API 持續回覆流量限制 |
| 502 | `DOCS_API_ERROR` | Google Docs API 其他錯誤或無效回應 |
| 504 | `DOCS_API_TIMEOUT` | 上游讀取逾時 |
| 500 | `INTERNAL_ERROR` | 未預期的 Function 錯誤 |

對外訊息必須固定，不轉送 Google API 的原始錯誤本文、文件資訊或 stack trace。

## 處理順序

1. 產生／取得 `requestId`，設定 JSON、UTF-8 與 `Cache-Control: no-store` 回應標頭。
2. 驗證 method 為 POST。
3. 讀取 `X-NGEIP-Webhook-Token`，與 Secret Manager 中的 `JIRA_DOC_WEBHOOK_TOKEN` 做常數時間比較。
4. 驗證 `Content-Type`、request body、`docUrl` 與 `issueKey`。
5. 從 URL 擷取 document ID；不向輸入 URL 發出網路請求。
6. 使用 Google application credentials 與 `documents.readonly` scope 呼叫
   `documents.get`，明確使用第一個 tab 的 legacy body 表示。
7. 依「純文字相容演算法」組合 `content`。
8. 計算 SHA-256，回傳成功 JSON。
9. 任何失敗由單一 error mapper 轉成固定錯誤契約，再寫入不含敏感資料的 structured log。

Google GET 是唯讀操作。只針對 429、500、502、503、504 做最多一次短暫重試；404 與 403 不重試，
整個 Google API 階段仍受 10 秒 deadline 約束。

## 純文字相容演算法

舊 n8n Google Docs v2 node 在 simple mode 的行為等價於：

```text
content = document.body.content
  .filter(item 有 paragraph)
  .flatMap(paragraph.elements 中存在的 textRun.content)
  .join("")
```

實作時不得：

- 對結果呼叫 `trim()` 或替換換行。
- 遞迴讀取 table cells。
- 自行補 bullet、number、tab title 或段落分隔符。
- 把圖片 alt text、頁首頁尾或註腳加進內容。

Google Docs API 在 `includeTabsContent=false` 時由 top-level `body` 提供第一個 tab；第一版明確使用此模式。
之後若要支援多 tab，新增契約版本或另一支 Function，避免改變既有 Jira description。

## Google Docs 驗證與權限

### 建議方案：專用 runtime service account

建立專用 identity，例如：

```text
jsm-google-doc-reader@noahxdm-eip.iam.gserviceaccount.com
```

Function 透過 Application Default Credentials 使用該 identity，不建立或提交 service-account key。
Google Docs API 必須在 `noahxdm-eip` 專案啟用，呼叫 scope 只使用：

```text
https://www.googleapis.com/auth/documents.readonly
```

IAM role 不會自動授予 Google Workspace 文件權限。指定文件或承載文件的 Drive folder 必須另外以 Viewer
分享給 service account。建議建立固定的「JSM description sources」資料夾並分享一次，所有允許同步的
文件放入該資料夾，避免逐份文件設定。

若 Workspace policy 禁止把文件分享給 `iam.gserviceaccount.com` identity，才改採經管理者核准的
domain-wide delegation 或專用 Workspace 使用者 OAuth；這兩種方案權限較廣，不能在未評估前直接啟用。

## Jira Automation 調整

保留現有 trigger、request type、公開留言與 marker conditions。更新以下 action：

1. Create variable 仍從 comment 正則擷取完整 Google Docs URL；變數可沿用 `docID`，但 request key 改成
   語意正確的 `docUrl`。
2. Send web request 改至正式 Function URL，method 為 POST，啟用 **Wait for response**。
3. 新增 hidden header `X-NGEIP-Webhook-Token`；`Content-Type` 維持 `application/json`。
4. Body 使用 JSON escaping：

```json
{
  "docUrl": {{docID.asJsonString}},
  "issueKey": {{issue.key.asJsonString}}
}
```

5. `Continue running the rule even if the request response is not successful` 維持關閉。非 2xx 時 rule 停止，
   因此 description 不會被空值覆寫。
6. 成功後用 Edit issue 將 description 設為：

```text
{{webhookResponse.body.source}}

{{webhookResponse.body.content}}
```

7. 移除記錄完整 Google Docs URL 的 Log action；可保留 issue key 與固定成功／失敗代碼。

Jira hidden header 在 rule export、duplicate 或 import 後可能不保留，搬遷與災難復原清單必須包含重新輸入
token 的步驟。

## 程式結構

```text
functions/src/
├── index.ts
└── jsm-google-doc-description/
    ├── http.ts                 # onRequest adapter、header/body/response
    ├── contract.ts             # request/response types 與 validation
    ├── google-doc-reader.ts    # Google authentication 與 documents.get
    ├── plain-text.ts           # 無 I/O 的 n8n-compatible extractor
    └── errors.ts               # domain error 與 HTTP mapping

functions/test/
├── plain-text.test.cjs
├── contract.test.cjs
└── http.test.cjs
```

`index.ts` 只 export Function。純文字轉換、URL validation 與錯誤 mapping 不依賴 Express request/response，
以便使用 Node.js built-in test runner 測試，不新增完整 web framework 或測試框架。

Google API 建議使用 `google-auth-library` 加上固定的 Docs REST endpoint，並在 `functions/package.json` 宣告為
直接 dependency；不依賴 Firebase Admin SDK 的 transitive dependency，也不引入完整 `googleapis` 套件。

## Secret 與本地環境

正式 secret：

```text
JIRA_DOC_WEBHOOK_TOKEN
```

token 至少使用 32 random bytes，Jira 與 Function 共用。以 `defineSecret()` 宣告並只綁定
`getGoogleDocPlainText`。正式設定指令：

```bash
firebase functions:secrets:set JIRA_DOC_WEBHOOK_TOKEN
```

Functions Emulator 使用未提交 Git 的 `functions/.secret.local` 覆寫；Google Docs smoke test 則使用本機
Application Default Credentials，且測試帳號／service account 只需被分享測試文件。

`.secret.local`、service-account JSON 與任何 OAuth token 都必須列入 ignore，不能放入 fixture。

## 記錄與監控

每次請求只記錄：

- `requestId`
- 經 validation 的 `issueKey`
- 結果 `success` 或固定 error code
- latency、Google API attempt count、`contentLength`
- 成功時可記錄 `contentHash`，但不記錄 `content`

不得記錄 webhook token、Authorization metadata、完整 request body、完整 Google Docs URL、document ID、
Google API response 或文件內容。Google API 原始錯誤只在受控欄位保留 status 與分類，不記錄 response body。

第一版不新增 Firestore audit collection。Cloud Logging 與 Jira Automation audit log 已足以追蹤同步結果，
也避免為低頻工具建立資料生命週期。

## 測試策略

### 單元測試

- URL：合法 edit URL、query／fragment、錯誤 hostname、HTTP、raw ID、缺 document ID。
- 契約：缺欄位、非字串、非法 issue key、額外欄位處理。
- Secret：缺少、錯誤、正確 token；比較 helper 不洩漏值。
- 純文字：多段落、多 text runs、空段落、bullet paragraph、table、inline object、空 document。
- 相容 fixture：保存一份去識別化 Docs API response 與舊 n8n `content`，逐字元比對。
- 錯誤 mapping：Google 403／404／429／5xx／timeout 與未預期錯誤。

### HTTP adapter／Emulator 測試

- 非 POST、非 JSON、未授權、合法請求與各種 domain error 的 status／headers／body。
- 透過 fake GoogleDocReader 測試，不讓 CI 連外。
- Functions Emulator 以 `.secret.local` 驗證實際 endpoint、secret binding 與 JSON parsing。

### 受控整合與切換驗證

Google Docs 沒有本地 emulator。部署前使用專用測試文件做受控 smoke test：

1. 將測試文件分享給 Function service account。
2. 文件包含一般段落、粗體分段、bullet、表格與圖片，用來確認只輸出 n8n 支援部分。
3. 分別驗證可讀、未分享與不存在的文件。
4. 在一張測試 JSM issue 留下指令，確認 description、換行及失敗不覆寫。
5. 同一份文件先由舊 n8n 匯出 fixture，再與 Function response 做 byte-for-byte 比對。

## 部署與切換順序

1. 建立專用 service account，啟用 Google Docs API，確認測試文件可讀。
2. 建立 `JIRA_DOC_WEBHOOK_TOKEN` secret 並部署 `getGoogleDocPlainText`。
3. 以 curl／Emulator 與正式測試文件驗證成功、401、403、404。
4. 複製 Jira Automation rule 為停用測試版，填入 Function URL 與 hidden token。
5. 在測試 issue 比對舊 n8n 與新 Function 的 description。
6. 啟用新 rule、停用舊 rule，避免同一 comment 被兩條規則處理。
7. 觀察 Jira audit log 與 Cloud Logging；確認穩定後再移除舊 n8n webhook URL。

回滾只需停用新 Jira rule 並恢復舊 rule；Function 本身不保存狀態，不需要資料回滾。

## 成本與限制

- 每次留言觸發一次 Function invocation 與一次 Google Docs API read，沒有 Firestore 讀寫。
- `minInstances=0` 允許冷啟動；此內部人工流程可接受數秒延遲。
- `maxInstances=3`、Google API deadline 與單次重試共同限制 denial-of-wallet 與上游壓力。
- Jira Automation 會同步等待外部服務，Google 長時間異常可能累積 Jira processing time；Function 必須在
  30 秒內結束，且上游階段在 10 秒內明確失敗。

## 參考資料

- [Google Docs API `documents.get`](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/get)
- [Google Docs 文件結構](https://developers.google.com/workspace/docs/api/concepts/structure)
- [Google Workspace service account 與文件分享](https://developers.google.com/workspace/guides/create-credentials)
- [Firebase HTTP Functions](https://firebase.google.com/docs/functions/http-events)
- [Firebase Secret Manager 與 Emulator secrets](https://firebase.google.com/docs/functions/config-env)
- [Jira Automation actions](https://support.atlassian.com/cloud-automation/docs/jira-automation-actions/)
