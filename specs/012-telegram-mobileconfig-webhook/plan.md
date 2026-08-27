# 實作計畫：Telegram Web Clip 描述檔產生器

## 架構

新增一支 Cloud Functions for Firebase 2nd gen HTTPS Function：

```text
Telegram webhook
  → 驗證 secret 與私人訊息
  → 解析 /createclip 指令
  → Telegram getFile 並下載圖片
  → 在記憶體產生 .mobileconfig
  → Telegram sendDocument
  → HTTP 200
```

流程預期僅需數秒，不建立 Firestore queue。Function 必須等待所有 Telegram API 呼叫完成後才結束，
不得在送出 HTTP response 後繼續背景工作。

## Function 與密鑰

| 設定 | 值 |
| --- | --- |
| Export name | `telegramMobileconfigWebhook` |
| Trigger | 2nd gen `onRequest` |
| Region | 繼承全域 `asia-east1` |
| Runtime | Node.js 22 |
| Timeout | 30 秒 |
| CORS | 關閉 |

Secret Manager 保存並只綁定此 Function：

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

handler 以常數時間比較 `X-Telegram-Bot-Api-Secret-Token`。不新增第三方套件，Telegram API 使用 Node.js
內建 `fetch`、`FormData` 與 `Blob`。

## 處理規則

1. 拒絕非 `POST` 或 secret 不符的請求。
2. 非私人聊天室回覆 200 並忽略；避免 Telegram 重送無需處理的 update。
3. 從 `message.text` 或 `message.caption` 解析指令；輸入錯誤時呼叫 `sendMessage` 回覆固定提示。
4. 從 `message.photo` 選擇最大尺寸的 `file_id`，呼叫 `getFile` 後從 Telegram 固定網域下載。
5. 對 `label` 與 URL 做 XML escaping，以 `crypto.randomUUID()` 建立 payload identifiers。
6. 在記憶體組合 plist，清理檔名中的控制字元與路徑字元，再以 `sendDocument` 回覆原訊息。
7. Telegram API 失敗時只記錄固定錯誤碼與 `update_id`；不得記錄 token、檔案或訊息本文。

本期不保存 `update_id`，維持既有 n8n 的低頻同步行為；若實際發生重複投遞或處理時間明顯增加，
再另案導入 Firestore 冪等紀錄或 Task Queue。

## 程式與測試

```text
functions/src/telegram-mobileconfig/
├── http.ts
└── mobileconfig.ts

functions/test/
├── telegram-mobileconfig.test.cjs
└── telegram-mobileconfig-http.test.cjs
```

`mobileconfig.ts` 保持無 I/O，負責指令解析、XML escaping、檔名清理與 plist 產生；`http.ts` 只負責
HTTP 驗證與 Telegram API。測試 mock 所有 Telegram 網路請求，不使用正式 token，也不新增 Firestore
Rules、索引或 Emulator 資料。

部署後以 Telegram `setWebhook` 設定正式 Function URL、`secret_token` 及 `allowed_updates=["message"]`。

## 手動驗證與部署

### 1. 本機檢查

```bash
npm install
npm run functions:test
cp functions/.secret.local.example functions/.secret.local
# 編輯 functions/.secret.local，填入本機測試用的三個 secret
npm --prefix functions run serve
```

Functions Emulator 啟動後，先驗證公開 endpoint 的防護；專案 ID 依 Emulator 輸出調整：

```bash
curl -i http://127.0.0.1:5001/noahxdm-eip/asia-east1/telegramMobileconfigWebhook

curl -i -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Telegram-Bot-Api-Secret-Token: wrong' \
  -d '{"update_id":1}' \
  http://127.0.0.1:5001/noahxdm-eip/asia-east1/telegramMobileconfigWebhook
```

兩次呼叫應分別回傳 `405` 與 `401`。完整成功流程需要 Telegram 能連入的公開 HTTPS URL；本期以正式環境
端到端驗證，不把 tunnel 工具加入專案依賴。

### 2. 建立正式 Secrets

由 BotFather 取得 bot token；再以 `openssl rand -hex 32` 產生 webhook secret，保存到密碼管理器。不要把值放在
command history、文件或 Git。以互動方式貼入：

```bash
firebase functions:secrets:set TELEGRAM_BOT_TOKEN --project=noahxdm-eip
firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET --project=noahxdm-eip
```

### 3. 部署單一 Function

```bash
firebase deploy \
  --config firebase.prod.json \
  --project=noahxdm-eip \
  --only functions:telegramMobileconfigWebhook
```

預期 webhook URL：

```text
https://asia-east1-noahxdm-eip.cloudfunctions.net/telegramMobileconfigWebhook
```

### 4. 註冊 Telegram Webhook

在 zsh 互動輸入 token 與先前保存的 webhook secret，避免寫入 shell history：

```bash
read -s "NGEIP_TELEGRAM_BOT_TOKEN?Bot token: "
read -s "NGEIP_TELEGRAM_WEBHOOK_SECRET?Webhook secret: "

curl --fail-with-body --silent --show-error \
  --request POST \
  "https://api.telegram.org/bot${NGEIP_TELEGRAM_BOT_TOKEN}/setWebhook" \
  --data-urlencode \
  'url=https://asia-east1-noahxdm-eip.cloudfunctions.net/telegramMobileconfigWebhook' \
  --data-urlencode "secret_token=${NGEIP_TELEGRAM_WEBHOOK_SECRET}" \
  --data-urlencode 'allowed_updates=["message"]'
```

確認 Telegram 回傳 `"ok":true`，再檢查狀態：

```bash
curl --fail-with-body --silent --show-error \
  "https://api.telegram.org/bot${NGEIP_TELEGRAM_BOT_TOKEN}/getWebhookInfo"

unset NGEIP_TELEGRAM_BOT_TOKEN NGEIP_TELEGRAM_WEBHOOK_SECRET
```

### 5. Telegram 端到端驗證

1. 在 Bot 私人聊天室上傳小型 PNG 或 JPEG，caption 輸入
   `/createclip label:測試入口 url:https://example.com`；應收到 `測試入口.mobileconfig` 並引用原訊息。
2. 在 macOS 下載檔案後執行 `plutil -lint 測試入口.mobileconfig`，應顯示 `OK`；檢查 Label、URL 與 Icon。
3. 傳送錯誤指令，應收到固定的指令格式提示。
4. 只傳正確指令、不附圖片，應收到缺少圖片提示。
5. 在群組傳送相同內容，Bot 應忽略。
6. 執行 `firebase functions:log --only telegramMobileconfigWebhook --project=noahxdm-eip`，確認成功 log 只有
   `requestId`、`updateId`、耗時與圖片大小，不含 chat ID、訊息、網址、圖片或 secret。

若需立即停止接收，使用相同的互動 token 呼叫 Telegram `deleteWebhook`。輪替任何 Secret 後必須重新部署此
Function；輪替 webhook secret 時也必須重新執行 `setWebhook`。
