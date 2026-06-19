# Training + AI Tool 共用補助池實作計畫

## 技術設計

在 `SubsidyLimitService` 保留 Training 與 AI Tool 的個別 Firestore 統計查詢，完成查詢後交由純函式計算單一共用池。純函式以兩類核准金額為輸入，回傳固定總額、合計已用、非負剩餘額度及分類使用量。

`UserSubsidyLimitStatus.subsidies` 對這兩種類型只回傳 Training 項目，並將其 `displayName` 設為 `Training + AI Tool`。AI Tool 統計只作為共用池輸入，不作為獨立卡片輸出。

## 資料流

```text
週年期間 approved Training ─┐
                             ├─ 共用池計算 ─ 唯一額度卡
週年期間 approved AI Tool ──┘
```

## 公式

```text
SHARED_LIMIT = 24,000
usedAmount = trainingUsedAmount + aiToolUsedAmount
availableAmount = max(0, SHARED_LIMIT - usedAmount)
```

## Firebase 影響

- 不新增或修改集合與欄位。
- 沿用 `subsidyApplications` 既有查詢與索引。
- 不增加 Firestore 讀寫次數。
- Security Rules 不需變更，因本次只調整讀取後的額度計算與顯示，不新增資料權限。

## UI

- 移除獨立 AI Tool 額度卡分支。
- 共用卡顯示 24,000 固定總額與共用剩餘額度。
- 沿用 Training／AI Tool 雙色堆疊進度條與圖例。

## 測試策略

對純計算函式驗證：

- 一般混合使用。
- AI Tool 使用量超過舊 10,000 子上限。
- 共用池恰好用盡。
- 既有核准資料超過 24,000 時剩餘額度固定為 0。

建置驗證 Angular template 已移除 AI Tool 獨立分支且型別正確。
