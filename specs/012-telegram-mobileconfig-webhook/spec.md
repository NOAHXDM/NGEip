# Telegram Web Clip 描述檔產生器

## 背景

既有 n8n workflow 會接收 Telegram 私人訊息，依使用者提供的名稱、網址與圖片產生 Apple Web Clip
`.mobileconfig`，再把檔案回傳至原聊天室。n8n 已銷毀，本功能改由 Cloud Functions for Firebase
2nd gen 承接。

## 使用者情境

使用者在 Bot 私人聊天室傳送圖片，並於訊息或圖片說明輸入：

```text
/createclip label:顯示名稱 url:https://example.com
```

系統驗證輸入後，以該圖片、名稱及網址產生 `.mobileconfig`，並回覆至原訊息。格式錯誤或未附圖片時，
系統回覆繁體中文提示且不產生檔案。非私人聊天室訊息不處理。

## 驗收標準

- Webhook 只接受 Telegram 以正確 secret token 傳入的 `POST` 請求。
- 指令必須包含非空白 `label` 與 `http://` 或 `https://` URL，並附有 Telegram 圖片。
- 產出內容為有效 plist，所有使用者文字均完成 XML escaping，UUID 使用安全亂數產生。
- 成功時以 `application/x-apple-aspen-config` 回傳 `{label}.mobileconfig`，並引用原訊息。
- 下載圖片、產生描述檔及傳送檔案在同一次 Function request 內完成後才回覆 HTTP 200。
- Bot token、webhook secret、圖片內容與完整訊息不得寫入 log、Git、Firestore 或前端設定。
- 指令解析、XML escaping、描述檔產生及錯誤路徑具備自動化測試。

## 範圍外

- Firestore、Task Queue、排程、執行歷程或重試工作流。
- 群組聊天室、使用者 allowlist、管理介面或使用量統計。
- 圖片縮放、裁切、格式轉換、掃毒或 `.mobileconfig` 簽章。
- 支援 Web Clip 以外的 Apple configuration profile payload。
