# 正式環境遷移快速指南

## 📋 前置準備檢查清單

- [ ] 已從 Firebase Console 下載 `serviceAccountKey.json`
- [ ] 已將金鑰檔案放置於 `tools/subsidy-migration/` 目錄
- [ ] 已在本地模擬器完整測試所有遷移腳本
- [ ] 確認所有 JSON 資料檔案完整且正確

## 🚀 快速執行步驟

### 1. 備份正式環境資料

```bash
cd tools/subsidy-migration
npm run backup
```

這會在 `backups/` 目錄建立時間戳記的備份檔案。

### 2. 執行遷移（正式環境）

```bash
# 個人筆電補助
npm run migrate:laptop:prod

# 進修課程補助
npm run migrate:training:prod

# 旅遊補助
npm run migrate:travel:prod

# 供餐補助
npm run migrate:meal:prod
```

### 3. 驗證遷移結果

```bash
npm run verify:prod
```

## 📝 手動執行方式

如果不使用 npm scripts，也可以直接執行：

```bash
# 備份
node backup-production.js

# 遷移
USE_PRODUCTION=true node migrate-laptop-subsidies.js ./laptop-subsidies.json
USE_PRODUCTION=true node migrate-training-courses.js ./training-courses.json
USE_PRODUCTION=true node migrate-travel-subsidies.js ./travel-subsidies.json
USE_PRODUCTION=true node migrate-lunch-orders.js ./lunch-orders.json

# 驗證
USE_PRODUCTION=true node verify-migration.js
```

## ⚠️ 重要提醒

1. **每個遷移腳本執行前會顯示環境資訊**，請確認顯示「使用正式環境 Firestore」
2. **遷移不會覆蓋現有資料**，只會新增記錄
3. **遇到錯誤立即停止**，不要重複執行
4. **保留備份檔案**直到確認遷移成功

## 🔍 檢查遷移結果

### 透過 Firebase Console

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 選擇專案 `noahxdm-eip`
3. 進入 Firestore Database
4. 檢查以下集合：
   - `subsidyApplications`（應有新增的補助申請）
   - `subsidyApplications/{id}/installments`（筆電分期子集合）
   - `subsidyApplications/{id}/auditTrail`（稽核軌跡子集合）
   - `mealSubsidies`（每日餐點記錄）
   - `userMealStats`（使用者月度統計）

### 透過驗證腳本

```bash
npm run verify:prod
```

驗證腳本會顯示：
- 各類型補助的數量統計
- 補助狀態分布
- 餐點記錄統計
- 資料品質抽樣檢查

## 🆘 遇到問題？

### 找不到 serviceAccountKey.json

```
❌ 錯誤：找不到 serviceAccountKey.json
```

**解決方式**：從 Firebase Console 下載 Service Account Key 並放到此目錄

### 權限錯誤

```
Error: Permission denied
```

**解決方式**：檢查 Service Account 權限，確保具有 Firestore 寫入權限

### 找不到使用者

```
⚠ 找不到使用者: XXX，跳過
```

**解決方式**：確認 Firestore `users` 集合中有該員工的資料，且姓名完全一致

## 📚 詳細文件

- [完整遷移指南](./README_PRODUCTION.md)
- [實作計畫](../../docs/plans/001-subsidy-application/SUBSIDY_IMPLEMENTATION_PLAN.md)
- [各類型遷移說明](./README_LAPTOP.md, ./README_TRAINING.md, 等)

## 🔐 安全提醒

執行完畢後：

```bash
# 限制金鑰檔案權限（僅擁有者可讀寫）
chmod 600 serviceAccountKey.json

# 或移動到安全位置
mv serviceAccountKey.json ~/secure-keys/

# 確認未提交到 Git
git status  # 應不會顯示 serviceAccountKey.json
```
