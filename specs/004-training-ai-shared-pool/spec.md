# Training + AI Tool 共用補助池規格

## 背景

既有系統讓 Training 與 AI Tool 共用 24,000 週年制額度，同時限制 AI Tool 最多只能使用 10,000。新規則移除 AI Tool 個別子上限，兩種類型只受同一個 24,000 共用池限制。

## 使用者故事

身為員工，我希望 Training 與 AI Tool 可以依實際需求彈性分配同一筆補助額度，而不受類型個別上限限制，並能在個人資料中清楚看到合計使用量、分類組成與剩餘額度。

## 功能需求

### FR-001 共用期間

Training 與 AI Tool 必須使用員工目前的到職日週年期間；區間包含起日、不包含下一個週年日。

### FR-002 計入資料

系統只計入週年期間內 `status == approved` 的申請，使用金額取 `approvedAmount`。pending、rejected 或期間外申請不得占用共用池。

### FR-003 唯一額度限制

Training 與 AI Tool 必須共用 24,000，且兩者皆不得有個別子上限。

```text
combinedUsed = trainingApprovedAmount + aiToolApprovedAmount
availableAmount = max(0, 24,000 - combinedUsed)
```

任一類型都可以使用完整的 `availableAmount`。

### FR-004 資格

兩種類型沿用試用期滿 90 天的資格條件。當共用剩餘額度為 0 時，共用池卡片必須顯示 `Quota exceeded`。

### FR-005 顯示

個人資料的「補助上限」只能顯示一張「Training + AI Tool」卡片，不得顯示獨立 AI Tool 額度卡。卡片必須顯示：

- 合計已使用金額
- 共用可用金額
- 共用總額 24,000
- Training 與 AI Tool 各自已使用金額
- 合計使用率

分類金額應以雙色堆疊進度條呈現。

## 驗收情境

1. Training 4,000、AI Tool 8,000：合計已用 12,000、可用 12,000、總額 24,000。
2. Training 0、AI Tool 20,000：合計已用 20,000、可用 4,000；不得因超過舊 10,000 門檻而判定額度用盡。
3. Training 14,000、AI Tool 10,000：合計已用 24,000、可用 0，顯示 `Quota exceeded`。
4. 既有核准資料合計 26,000：已用仍顯示 26,000，可用不得低於 0。
5. 額度頁面只出現「Training + AI Tool」共用卡，不出現獨立「AI Tool」卡。

## 不在本次範圍

- 改變 90 天試用期規則。
- 將 pending 申請預占額度。
- 在建立或核准寫入時強制阻擋超額。
- 修改既有 Firestore 資料或集合結構。

## 成功標準

- AI Tool 可單獨使用最高 24,000 共用額度。
- 所有額度文字、公式、程式註解與 UI 均不再宣稱 AI Tool 有 10,000 個別上限。
- 共用池計算的邊界案例具備自動化測試。
