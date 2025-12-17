# 正式環境資料遷移指南

本指南說明如何將補助資料遷移腳本從本地模擬器切換到正式環境 Firestore。

## ⚠️ 重要安全提醒

1. **備份優先**：執行任何遷移前，務必先備份正式環境資料
2. **測試驗證**：建議先在模擬器環境完整測試後再執行正式遷移
3. **敏感資料**：`serviceAccountKey.json` 絕對不可提交到 Git
4. **權限控制**：Service Account Key 具有完整管理權限，請妥善保管

---

## 步驟 1：取得 Firebase Service Account Key

### 1.1 從 Firebase Console 下載金鑰

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 選擇專案：`noahxdm-eip`
3. 點擊「專案設定」⚙️ → 「服務帳戶」標籤
4. 點擊「產生新的私密金鑰」按鈕
5. 下載 JSON 檔案

### 1.2 放置金鑰檔案

```bash
# 將下載的金鑰檔案重新命名並移動到此目錄
mv ~/Downloads/noahxdm-eip-xxxxx.json ./serviceAccountKey.json
```

### 1.3 驗證檔案格式

確保 `serviceAccountKey.json` 包含以下欄位：
```json
{
  "type": "service_account",
  "project_id": "noahxdm-eip",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "firebase-adminsdk-xxxxx@noahxdm-eip.iam.gserviceaccount.com",
  ...
}
```

---

## 步驟 2：修改遷移腳本

### 2.1 方案 A：使用環境變數切換（推薦）

在每個遷移腳本開頭加入環境檢查：

```javascript
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 判斷是否使用正式環境
const USE_PRODUCTION = process.env.USE_PRODUCTION === 'true';

// 初始化 Firebase Admin
if (!admin.apps.length) {
  if (USE_PRODUCTION) {
    // === 正式環境配置 ===
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://noahxdm-eip.firebaseio.com`
    });
    console.log('⚠️  使用正式環境 Firestore');
  } else {
    // === 模擬器配置 ===
    admin.initializeApp({
      projectId: 'noahxdm-eip'
    });
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    console.log('✓ 使用本地模擬器');
  }
}

const db = admin.firestore();
```

**使用方式**：
```bash
# 本地模擬器（預設）
node migrate-laptop-subsidies.js ./laptop-subsidies.json

# 正式環境
USE_PRODUCTION=true node migrate-laptop-subsidies.js ./laptop-subsidies.json
```

### 2.2 方案 B：建立專用的正式環境腳本

複製現有腳本並修改：

```bash
# 建立正式環境專用腳本
cp migrate-laptop-subsidies.js migrate-laptop-subsidies.prod.js
```

修改 `migrate-laptop-subsidies.prod.js` 的初始化部分：

```javascript
// 初始化 Firebase Admin（正式環境）
if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

console.log('⚠️  警告：即將寫入正式環境 Firestore！');
```

---

## 步驟 3：備份正式環境資料

### 3.1 使用 Firebase CLI 匯出

```bash
# 安裝 Firebase CLI（如果尚未安裝）
npm install -g firebase-tools

# 登入 Firebase
firebase login

# 匯出整個 Firestore 資料庫
firebase firestore:export firestore-backup/$(date +%Y%m%d_%H%M%S)
```

### 3.2 建立備份腳本

建立 `backup-production.js`：

```javascript
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function backupCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  const data = [];

  for (const doc of snapshot.docs) {
    data.push({
      id: doc.id,
      ...doc.data()
    });
  }

  const filename = `backup-${collectionName}-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`✓ 備份完成: ${filename} (${data.length} 筆)`);
}

// 備份相關集合
Promise.all([
  backupCollection('subsidyApplications'),
  backupCollection('mealSubsidies'),
  backupCollection('userMealStats')
]).then(() => {
  console.log('✓ 所有備份完成');
  process.exit(0);
}).catch(error => {
  console.error('✗ 備份失敗:', error);
  process.exit(1);
});
```

執行備份：
```bash
node backup-production.js
```

---

## 步驟 4：執行遷移（正式環境）

### 4.1 預檢查清單

在執行前確認：

- [ ] 已下載並放置 `serviceAccountKey.json`
- [ ] 已備份正式環境資料
- [ ] 已在模擬器完整測試遷移腳本
- [ ] JSON 資料檔案正確且完整
- [ ] 確認所有員工姓名能正確匹配 Firestore users 集合
- [ ] 了解遷移會新增資料（不會刪除現有資料）

### 4.2 執行遷移

```bash
# 方案 A：使用環境變數
USE_PRODUCTION=true node migrate-laptop-subsidies.js ./laptop-subsidies.json
USE_PRODUCTION=true node migrate-training-courses.js ./training-courses.json
USE_PRODUCTION=true node migrate-travel-subsidies.js ./travel-subsidies.json
USE_PRODUCTION=true node migrate-lunch-orders.js ./lunch-orders.json

# 方案 B：使用專用腳本
node migrate-laptop-subsidies.prod.js ./laptop-subsidies.json
node migrate-training-courses.prod.js ./training-courses.json
node migrate-travel-subsidies.prod.js ./travel-subsidies.json
node migrate-lunch-orders.prod.js ./lunch-orders.json
```

### 4.3 驗證遷移結果

1. **檢查 Firebase Console**
   - 前往 Firestore Database
   - 確認 `subsidyApplications` 集合中的資料
   - 檢查子集合 `installments` 和 `auditTrail`

2. **透過腳本驗證**

建立 `verify-migration.js`：

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function verifyMigration() {
  // 統計各類型補助數量
  const snapshot = await db.collection('subsidyApplications').get();

  const stats = {
    total: snapshot.size,
    byType: {},
    byStatus: {}
  };

  snapshot.forEach(doc => {
    const data = doc.data();
    stats.byType[data.type] = (stats.byType[data.type] || 0) + 1;
    stats.byStatus[data.status] = (stats.byStatus[data.status] || 0) + 1;
  });

  console.log('遷移驗證結果:');
  console.log(`總筆數: ${stats.total}`);
  console.log('補助類型分布:', stats.byType);
  console.log('狀態分布:', stats.byStatus);
}

verifyMigration()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('驗證失敗:', error);
    process.exit(1);
  });
```

執行驗證：
```bash
node verify-migration.js
```

---

## 步驟 5：錯誤處理與回復

### 5.1 如果遷移失敗

1. **查看錯誤訊息**：腳本會輸出失敗的詳細資訊
2. **不要重複執行**：修正問題前不要重複執行遷移
3. **檢查部分資料**：某些資料可能已成功寫入

### 5.2 清除錯誤資料

如需清除部分遷移的資料：

```javascript
// delete-subsidies.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function deleteSubsidiesByType(type) {
  const snapshot = await db.collection('subsidyApplications')
    .where('type', '==', type)
    .get();

  console.log(`找到 ${snapshot.size} 筆類型 ${type} 的補助`);

  // 批次刪除
  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(`✓ 已刪除 ${snapshot.size} 筆資料`);
}

// 使用方式：刪除類型 1（筆電補助）
deleteSubsidiesByType(1)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('刪除失敗:', error);
    process.exit(1);
  });
```

### 5.3 從備份回復

```bash
# 使用 Firebase CLI 回復
firebase firestore:import firestore-backup/20250101_120000
```

---

## 安全最佳實踐

### 1. Service Account Key 管理

- ✅ 儲存在安全位置（本機加密硬碟）
- ✅ 加入 `.gitignore`（已完成）
- ✅ 定期輪替金鑰
- ❌ 絕不上傳到 Git、雲端硬碟、Slack 等
- ❌ 絕不硬編碼在程式碼中

### 2. 執行權限控制

```bash
# 限制檔案權限（僅擁有者可讀寫）
chmod 600 serviceAccountKey.json
```

### 3. 使用後清理

```bash
# 遷移完成後，可選擇刪除本機金鑰
rm serviceAccountKey.json

# 或移動到安全位置
mv serviceAccountKey.json ~/secure-keys/
```

### 4. 審計日誌

Firebase 會記錄所有 Admin SDK 操作，可在 Firebase Console 的「稽核記錄」中查看。

---

## 常見問題 (FAQ)

### Q1: 遷移會覆蓋現有資料嗎？
A: 不會。遷移腳本使用 `.add()` 新增文件，不會修改或刪除現有資料。

### Q2: 可以重複執行遷移嗎？
A: 可以，但會產生重複資料。建議執行前先清除或檢查是否已存在相同資料。

### Q3: 如何確認是否連接到正式環境？
A: 腳本會在初始化時印出環境資訊。方案 A 會顯示「使用正式環境 Firestore」。

### Q4: 遷移速度慢怎麼辦？
A: Firestore 寫入有速率限制。可以在腳本中加入批次處理（batch writes）或延遲（delay）。

### Q5: Service Account Key 遺失或洩漏怎麼辦？
A: 立即到 Firebase Console 刪除該金鑰，並產生新的金鑰。

---

## 相關文件

- [Firebase Admin SDK 文件](https://firebase.google.com/docs/admin/setup)
- [Firestore 安全規則](https://firebase.google.com/docs/firestore/security/get-started)
- [補助實作計畫](../../docs/plans/001-subsidy-application/SUBSIDY_IMPLEMENTATION_PLAN.md)

---

## 聯絡支援

遇到問題請檢查：
1. Firebase Console 的配額和使用量
2. Firestore 安全規則是否正確
3. Service Account 權限是否足夠
