# JSM 留言同步 Google Docs 純文字至描述

## 背景

既有 n8n workflow `[Webhook] Get google doc content to modify JSM issue description`
由 Jira Automation 在公開留言包含 `#descriptionFromDocID` 時呼叫。workflow 讀取留言中的
Google Docs URL，取得文件純文字後，將「原始 Google Docs URL、空白行、純文字內容」覆寫至
目前 JSM issue 的 description。

n8n 已銷毀，本功能改由 Cloud Functions for Firebase 2nd gen 承接。Jira Automation 仍是唯一的
Jira 寫入者；Function 只讀 Google Docs 並同步回傳結果，不保存 Jira API 憑證、不直接修改 issue，
也不使用 Firestore。

## 使用者情境

1. 身為內部 Jira 操作者，我在「版面相關 (DMIT)」issue 的公開留言中貼上指定指令與
   Google Docs URL 後，系統會把文件內容同步至該 issue description。
2. 身為內部 Jira 操作者，我希望搬遷後的 description 純文字結果與既有 n8n workflow 相容，
   不因 Google Docs 樣式或 Jira API 格式改變。
3. 身為維運人員，我希望 Google Docs 不存在、無權限或服務暫時失敗時，原 description 保持不變，
   並能從 Jira Automation audit log 與 Function structured log 判斷失敗類型。
4. 身為系統管理者，我希望 Jira 呼叫端與 Google Docs 讀取權限彼此分離，且所有密鑰都不進入 Git、
   Firestore 或前端設定。

## Jira 留言格式

指令必須獨立成一行：

```text
#descriptionFromDocID https://docs.google.com/document/d/DOCUMENT_ID/edit
```

Jira Automation 負責從 comment 擷取 URL。本期維持既有公開留言條件：

```text
{{comment.internal}} == false
```

依目前作業前提，能在這類 issue 留言者皆為內部人員，因此本期不增加 internal comment 或
comment author 群組限制。

## 純文字相容規則

第一版必須重現舊 n8n Google Docs v2 node 的 simple output：

- 只讀 Google Docs 第一個 tab 的 body。
- 依文件順序走訪 body 最外層 structural elements。
- 只收集 paragraph elements 中的 `textRun.content`，並直接串接。
- 保留 Google Docs API 回傳的換行與空白，不執行 `trim()`、Markdown 或 HTML 轉換。
- 不加入 bullet／numbering 符號。
- 不收集表格儲存格、頁首、頁尾、註腳、圖片、drawing、equation 或其他 inline object。
- 空文件仍視為成功；Jira description 只會留下來源 URL 與既有的分隔空白行。

上述限制是相容需求，不代表最終格式能力。若日後需要表格、清單或多 tab，必須以新版本契約處理，
不可直接改變第一版輸出。

## 驗收標準

- 合法且可讀的 Google Docs URL 會在單次同步 HTTP 請求中取得純文字並回傳 Jira Automation。
- Jira Automation 收到成功回應後，將 description 設為 `source + "\n\n" + content`。
- 搬遷前後以同一份測試文件比對時，`content` 必須逐字元一致。
- Function 不接受非 `POST`、非 JSON、缺少必要欄位、非 Google Docs URL 或驗證失敗的請求。
- Google Docs 不存在、無權限、流量限制、逾時或其他上游錯誤時，Function 回傳可判別的非 2xx；
  Jira Automation 不得執行 Edit issue。
- Function 不記錄 webhook token、完整 Google Docs URL、文件內容或 Google API access token。
- Google Docs 讀取使用唯讀 scope；正式密鑰只存放於 Secret Manager。
- Function 部署於 `asia-east1`，本功能不存取 Firestore。

## 範圍外

- 將 Jira API credential 放入 Function，或由 Function 直接更新 issue。
- 將 Google Docs 轉成 Atlassian Document Format、Markdown 或富文字。
- 支援 Google Sheets、Drive 一般檔案 URL、短網址或非 `docs.google.com/document/d/...` URL。
- 讀取多個 tabs、表格、頁首頁尾、註腳或圖片文字。
- Firestore 工作佇列、非同步 job、結果快取、排程或 webhook status endpoint。
- 比對目前 Jira description 後略過 no-op 更新；可於確認第一版穩定後另案加入。
