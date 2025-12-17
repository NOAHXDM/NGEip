# Firestore 資料同步工具

從正式環境同步 Firestore 資料到本地模擬器,方便本地開發測試。

## 📋 功能特色

- ✅ 完整同步所有 collections 及 subcollections
- ✅ 支援選擇性同步特定 collections
- ✅ 支援排除特定 collections
- ✅ 批次寫入最佳化 (每批 500 筆)
- ✅ 試運行模式 (dry-run)
- ✅ 遞迴處理 subcollections
- ✅ 詳細的同步進度顯示

---

## 🚀 快速開始

### 步驟 1：取得 Service Account Key（首次設定）

1. 開啟 [Firebase Console](https://console.firebase.google.com/)
2. 選擇你的專案
3. 點擊 ⚙️ → 專案設定 → 服務帳戶
4. 點擊「產生新的私密金鑰」
5. 下載 JSON 檔案

### 步驟 2：放置金鑰檔案

將下載的檔案重新命名並移動到正確位置：

```bash
mv ~/Downloads/your-project-xxxxx.json tools/subsidy-migration/serviceAccountKey.json
```

**注意：** `serviceAccountKey.json` 已自動加入 `.gitignore`,不會被提交到版本控制。

### 步驟 3：啟動模擬器

在專案根目錄執行：

```bash
npm start
```

確認模擬器正在運行：
- Firestore 模擬器：http://localhost:8080
- 模擬器 UI：http://localhost:4000

### 步驟 4：執行同步

```bash
cd tools/subsidy-migration

# 建議第一次先試運行
node sync-from-prod.js --dry-run

# 確認無誤後,立即同步所有資料
node sync-from-prod.js --now
```

---

## 📖 使用說明

### 基本語法

```bash
node sync-from-prod.js [options]
```

### 可用參數

| 參數 | 說明 | 範例 |
|------|------|------|
| `--collections <names>` | 只同步指定的 collections（逗號分隔） | `--collections users,attendanceLogs` |
| `--exclude <names>` | 排除指定的 collections（逗號分隔） | `--exclude systemConfig` |
| `--dry-run` | 試運行模式,不實際寫入資料 | `--dry-run` |
| `--now` 或 `-y` | 立即執行,跳過 5 秒等待 | `--now` |

### 使用範例

#### 1. 同步所有資料（立即執行）

```bash
node sync-from-prod.js --now
```

#### 2. 同步所有資料（等待 5 秒）

```bash
node sync-from-prod.js
```

按下 Ctrl+C 可取消執行。

#### 3. 只同步使用者資料

```bash
node sync-from-prod.js --collections users -y
```

#### 4. 同步補助相關資料

```bash
node sync-from-prod.js --collections subsidyApplications,mealSubsidies,userMealStats --now
```

#### 5. 同步所有資料,但排除系統設定

```bash
node sync-from-prod.js --exclude systemConfig -y
```

#### 6. 試運行（推薦第一次執行）

```bash
node sync-from-prod.js --dry-run
```

試運行會顯示將要同步的資料,但不會實際寫入模擬器。

---

## 🔍 驗證同步結果

### 方法 1：使用模擬器 UI

開啟瀏覽器訪問：
```
http://localhost:4000/firestore
```

檢查以下 collections 是否已同步：
- `users` - 使用者資料
- `attendanceLogs` - 出勤記錄
- `subsidyApplications` - 補助申請
- `mealSubsidies` - 午餐補助
- `systemConfig` - 系統設定
- 其他專案相關的 collections

### 方法 2：檢查同步統計

執行完成後,終端機會顯示統計資訊：

```
====================================
  同步完成統計
====================================
Collections: 5/5
Documents: 1,234 筆
耗時: 12.34 秒
====================================
```

---

## ⚙️ 運作原理

### 資料流程

```
正式環境 Firestore
    ↓
讀取 collections & documents
    ↓
遞迴讀取 subcollections
    ↓
批次寫入本地模擬器
(每批最多 500 筆)
```

### 關鍵特性

1. **遞迴處理**：自動處理所有層級的 subcollections
2. **批次寫入**：使用 Firestore batch 最佳化寫入效能
3. **錯誤處理**：個別 collection 失敗不影響其他 collections
4. **進度顯示**：即時顯示讀取/寫入進度

### 連線配置

- **正式環境**：使用 `serviceAccountKey.json` 連線
- **模擬器**：連線至 `localhost:8080`

---

## ⚠️ 注意事項

### 重要提醒

1. **資料會被覆蓋**
   - 同步會覆蓋模擬器中的現有資料
   - 建議定期備份重要的本地測試資料

2. **試運行優先**
   - 第一次使用建議先執行 `--dry-run`
   - 確認要同步的 collections 和數量

3. **保護金鑰**
   - `serviceAccountKey.json` 包含敏感憑證
   - 已自動加入 `.gitignore`
   - 切勿提交到版本控制系統

4. **網路連線**
   - 需要能連線到 Firebase 服務
   - 大量資料可能需要較長時間

5. **模擬器必須運行**
   - 執行前確保已啟動模擬器 (`npm start`)
   - 確認 port 8080 未被其他程式佔用

---

## 🆘 常見問題

### Q1: 找不到 serviceAccountKey.json

**症狀：**
```
Error: 找不到 Service Account Key 檔案
```

**解決方法：**
- 確認檔案已正確放置在 `tools/subsidy-migration/` 目錄
- 檢查檔名是否正確（區分大小寫）
- 確認檔案格式為有效的 JSON

### Q2: 連線模擬器失敗

**症狀：**
```
Error: connect ECONNREFUSED 127.0.0.1:8080
```

**解決方法：**
- 確認模擬器正在運行：`npm start`
- 檢查 port 8080 是否被其他程式佔用
- 嘗試重新啟動模擬器

### Q3: 同步後沒有資料

**可能原因：**
- 使用了 `--dry-run` 參數（試運行不會寫入）
- 沒有使用 `--now` 參數,且在倒數時按了 Ctrl+C
- 模擬器 UI 快取問題

**解決方法：**
- 確認沒有使用 `--dry-run` 參數
- 使用 `--now` 參數立即執行
- 重新整理模擬器 UI (Cmd/Ctrl + Shift + R)
- 清除瀏覽器快取

### Q4: 權限錯誤

**症狀：**
```
Error: Permission denied
```

**解決方法：**
- 確認 Service Account 有 Firestore 讀取權限
- 檢查 Firebase 專案是否正確
- 嘗試重新下載 Service Account Key

### Q5: 同步很慢或超時

**原因：**
- 資料量大
- 網路速度慢
- subcollections 層級深

**建議：**
- 使用 `--collections` 參數分批同步
- 檢查網路連線狀況
- 考慮排除不需要的 collections

---

## 🛠️ 進階用法

### 組合使用多個參數

```bash
# 同步特定 collections 並立即執行
node sync-from-prod.js --collections users,subsidyApplications --now

# 同步除了某些 collections 之外的所有資料
node sync-from-prod.js --exclude systemConfig,testData -y

# 試運行特定 collections
node sync-from-prod.js --collections users --dry-run
```

### 整合到開發流程

在 `package.json` 中加入快捷指令：

```json
{
  "scripts": {
    "sync:all": "cd tools/subsidy-migration && node sync-from-prod.js --now",
    "sync:users": "cd tools/subsidy-migration && node sync-from-prod.js --collections users -y",
    "sync:dry": "cd tools/subsidy-migration && node sync-from-prod.js --dry-run"
  }
}
```

使用方式：

```bash
npm run sync:all     # 同步所有資料
npm run sync:users   # 只同步使用者
npm run sync:dry     # 試運行
```

---

## 📚 相關文件

- [Firebase Admin SDK 文件](https://firebase.google.com/docs/admin/setup)
- [Firestore 批次寫入](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Firebase 模擬器文件](https://firebase.google.com/docs/emulator-suite)

---

## 🔒 安全性建議

1. **Service Account Key 管理**
   - 定期輪換金鑰
   - 使用最小權限原則
   - 不要在公開場合分享金鑰

2. **本地開發**
   - 僅在本地開發環境使用此工具
   - 不要在正式環境執行

3. **資料保護**
   - 注意敏感資料的處理
   - 定期清理測試資料

---

## 📝 更新日誌

### 最新版本
- ✅ 支援完整的 collection 和 subcollection 同步
- ✅ 批次寫入最佳化
- ✅ 試運行模式
- ✅ 選擇性同步和排除功能
- ✅ 詳細的進度顯示

---

## 💡 提示

- 定期從正式環境同步資料可確保本地開發環境與正式環境一致
- 使用 `--exclude` 排除經常變動但不重要的 collections
- 大型專案建議分批同步,避免一次處理過多資料
- 搭配 Git 分支管理,在不同分支測試不同的資料狀態
