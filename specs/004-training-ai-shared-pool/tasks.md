# 任務清單：Training + AI Tool 共用補助池

**輸入**：`specs/004-training-ai-shared-pool/spec.md`、`specs/004-training-ai-shared-pool/plan.md`
**範圍**：將 Training 與 AI Tool 改為單一 24,000 週年制共用池，並只顯示一張共用卡片。

## Phase 1：規格與影響盤點

- [x] T001 [P] 以繁體中文建立產品需求與驗收情境於 `specs/004-training-ai-shared-pool/spec.md`
- [x] T002 [P] 記錄技術設計、Firestore 查詢、成本與測試策略於 `specs/004-training-ai-shared-pool/plan.md`
- [x] T003 確認沿用 `subsidyApplications` 查詢與既有權限，不需修改 `firestore.rules`、`firestore.indexes.json` 或資料模型

## Phase 2：使用者故事 US1－單一共用額度池（P1）

**目標**：Training 與 AI Tool 皆可使用同一個 24,000 額度池，不受個別子上限限制。
**獨立驗證**：AI Tool 單獨核准 20,000 時，系統顯示可用 4,000。

### 測試

- [x] T004 [P] [US1] 在 `src/app/services/subsidy-limit.service.spec.ts` 建立共用池公式與邊界單元測試
- [x] T005 [P] [US1] 在 `src/app/services/subsidy-limit.service.spec.ts` 建立服務整合測試，驗證跨服務統計合併及移除 AI Tool 獨立卡片

### 實作

- [x] T006 [US1] 在 `src/app/services/subsidy-limit.service.ts` 建立 `TRAINING_AI_SHARED_LIMIT` 與純計算函式
- [x] T007 [US1] 在 `src/app/services/subsidy-limit.service.ts` 將 Training 與 AI Tool 核准金額合併成單一額度結果
- [x] T008 [US1] 在 `src/app/services/subsidy-limit.service.ts` 移除 AI Tool 個別額度設定，避免產生假的獨立上限語意

## Phase 3：使用者故事 US2－單一卡片顯示（P1）

**目標**：使用者只看到一張「Training + AI Tool」卡片，並可辨識兩類使用量。
**獨立驗證**：額度清單不存在 AI Tool 獨立卡片，共用卡顯示合計、剩餘、總額及雙色組成。

- [x] T009 [US2] 在 `src/app/user-profile/user-profile.component.html` 移除 AI Tool 獨立卡片並保留雙色共用進度條
- [x] T010 [US2] 在 `src/app/user-profile/user-profile.component.ts` 暴露 `SubsidyType` enum，移除模板類型魔法數字

## Phase 4：文件、效能與交付驗證

- [x] T011 [P] 更新 `README.md` 與 `CHANGELOG.md` 的共用池公式、顯示方式及歷史規則取代關係
- [x] T012 確認本功能不新增 Firestore 讀寫、監聽、索引、資料欄位或外部套件
- [x] T013 執行 `npm test -- --watch=false --browsers=ChromeHeadless` 與 `tsc -p tsconfig.app.json --noEmit`
- [x] T014 診斷 `ng build` exit 134，確認來源為本機 LMDB native cache，並以停用 local cache 的 CI 模式重新驗證
- [x] T015 在可連線 Google Fonts 的環境執行 `CI=true npm run build`，確認 production build 完成（initial bundle 2.18 MB）

## 相依性

- Phase 1 完成後才能確認 Phase 2、3 的實作邊界。
- US1 的共用池結果是 US2 單一卡片的資料來源。
- Phase 4 依賴 US1、US2 完成。

## 憲章檢查

- Firebase-only：符合；未引入新後端或套件。
- Firestore / Security Rules：沿用既有查詢與權限，無資料模型或權限變更。
- 效能與成本：查詢數量不變，僅在前端合併既有統計。
- 測試：具備純商業規則單元測試與服務跨流程整合測試。
- 文件：spec、plan、tasks 與 README 均使用繁體中文。
