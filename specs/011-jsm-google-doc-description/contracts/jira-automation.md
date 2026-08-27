# Jira Automation request 契約

本文件只記錄 Jira Automation 應套用的設定；儲存庫實作不會自動登入或修改 Jira。

## 保留的 trigger 與 conditions

- Trigger：Comment added。
- Project：既有 DMIT project。
- JQL：`"Request Type" = "版面相關 (DMIT)"`。
- `{{comment.internal}}` equals `false`。
- `{{comment.body}}` contains `#descriptionFromDocID`。

## 擷取 Google Docs URL

Create variable：

```text
Name: docID
Smart value: {{comment.body.match("(?m)^#descriptionFromDocID[ \t]+(https://docs\.google\.com/document/d/[A-Za-z0-9_-]+(?:/\S*)?)[ \t]*$")}}
```

留言指令必須獨立成一行：

```text
#descriptionFromDocID https://docs.google.com/document/d/DOCUMENT_ID/edit
```

## Send web request

```text
Method: POST
URL: https://asia-east1-noahxdm-eip.cloudfunctions.net/getGoogleDocPlainText
Wait for response: enabled
Continue running the rule even if the request response is not successful: disabled
```

Headers：

```text
Content-Type: application/json
X-NGEIP-Webhook-Token: <Secret Manager 中 JIRA_DOC_WEBHOOK_TOKEN 的相同值>
```

`X-NGEIP-Webhook-Token` 必須在 Jira 標示為 hidden。不得把實際值寫入本文件、rule description 或 log action。

Custom body：

```json
{
  "docUrl": {{docID.asJsonString}},
  "issueKey": {{issue.key.asJsonString}}
}
```

## Edit issue

Send web request 成功後才執行 Edit issue。Description 設為：

```text
{{webhookResponse.body.source}}

{{webhookResponse.body.content}}
```

非 2xx 時 Send web request action 直接失敗並停止 rule，保留原 description。

## 不應保留的 action

- 記錄 `{{docID}}` 或完整 comment body 的 Log action。
- 舊 n8n webhook URL。
- 由 Function 直接回呼 Jira 的 credential 或 action。

## 匯入／複製注意事項

Jira hidden header 在 rule export、import 或 duplicate 後可能需要重新輸入。套用前應逐項確認：

1. Function URL 是 `asia-east1` 正式 endpoint。
2. Wait for response 已啟用。
3. hidden token 已重新填入。
4. 非 2xx 不繼續執行。
5. 測試 issue 成功時 description 為 Google Docs URL、空白行、純文字內容。
6. 403／404 測試時原 description 不變。
