# AngularFire 21 升級：審查與獨立驗證紀錄

日期：2026-11-07。審查者：Claude。對象：分支 `codex/angularfire-21-upgrade`（`a2580a1..5f56633`，共 4 個實作 commit）。

本文件記錄對 Codex 實作結果的獨立審查與重跑驗證，並列出交由 Codex 處理的建議事項。本文件不代表已部署，也不取代 [實作驗證紀錄](2026-11-07-angularfire-21-validation.md)。

## 1. 審查範圍

| Commit | 內容 |
| --- | --- |
| `500aafa` | Angular／CLI／AngularFire 21 migration（package.json、lockfile、tsconfig） |
| `cd18bff` | Material／CDK 21 |
| `76ba2d8` | Firebase 12、ng-matero 21、CI、評鑑整合 runner、Service Worker、版本號與文件 |
| `5f56633` | 評鑑表單須對應既有指派的 Rules／服務修正（使用者核准的範圍例外） |

## 2. 獨立驗證結果

環境：Node 22.23.4、npm 10.9.9、Chrome Headless 156、本機 Firebase Emulator。

| 檢查 | 指令 | 結果 |
| --- | --- | --- |
| 嚴格安裝 | `npm ci --dry-run --ignore-scripts`（不帶 legacy-peer-deps） | ✅ 通過（升級前為失敗） |
| 依賴樹 | `npm ls @angular/core @angular/fire firebase rxfire @firebase/rules-unit-testing @ng-matero/extensions typescript` | ✅ Angular 21.2.26、AngularFire 21.0.0、單一 firebase 12.19.0、rxfire 6.3.0、ng-matero 21.3.1／adapter 21.0.0；functions workspace 獨立 TypeScript 5.8.3，根目錄 5.9.3 |
| 型別檢查 | `npx tsc -p tsconfig.spec.json --noEmit`、`npx tsc -p tsconfig.app.json --noEmit` | ✅ 通過 |
| 單元測試 | `npm test -- --watch=false` | ✅ 369 通過，86 略過，與 Codex 紀錄一致 |
| 評鑑整合 | `npm run test:evaluation-integration` | ✅ 76／76 通過 |
| 正式 build | `npm run build` | ✅ 通過，但出現 initial budget warning（見 3.1） |
| Bundle 基線 | 以 `f45c418` 建立暫時 worktree，`npm ci --legacy-peer-deps` 後 `ng build` | 升級前 initial 2.36 MB（傳輸 512.69 kB）；暫時 worktree 已移除 |

確認符合計畫的項目：

- 移除 CI `--legacy-peer-deps`，並加入附件 audit、附件／出勤 Rules 與評鑑整合測試。
- 根 package.json 明確宣告 `firebase ^12.19.0`；Service Worker CDN 同步為 12.19.0。
- 版本號提升至 4.6.0，同步 package.json、lockfile、README 與 CHANGELOG。
- 保留 Zone.js 與 Karma；評鑑測試改為 opt-in runner（`evaluationIntegration` client arg），一般 `npm test` 仍略過 emulator 案例，沒有讓單元測試連線 emulator。
- 附件 Karma rules spec 標註為契約參考，實際由 `test:attachment-rules` 覆蓋，符合計畫要求的分工說明。
- 計畫已記錄 v22 追蹤與 component 直接存取 Firebase 的技術債。

## 3. 審查發現與建議

### 3.1 [P2] Initial bundle 增加約 240 KB，budget warning 為本次新增

| | 升級前 `f45c418` | 升級後 `5f56633` | 差異 |
| --- | --- | --- | --- |
| Initial raw | 2.36 MB | 2.60 MB | +約 240 KB（約 +10%） |
| Initial 傳輸 | 512.69 kB | 566.20 kB | +53.5 kB |
| 2.5 MB warning | 未觸發 | 觸發（超出 103.14 kB） | 新增 |

驗證紀錄中「尚未建立升級前 production bundle 基線，不能宣稱 2.60 MB warning 為新增或既有」可據此更新：**warning 為升級新增**。

建議：

1. 將上表基線寫入實作驗證紀錄。
2. 以 `ng build --stats-json` 搭配 esbuild metafile 分析，比較升級前後 initial chunk 的模組來源，判斷增量來自 Firebase 12、AngularFire 21、Material 21 或 ng-matero 21。
3. 檢查是否有原本 lazy 的 Firebase 模組（如 Messaging、Storage）因 provider 初始化方式改變而進入 initial。
4. 不得以提高 budgets 作為解法；若增量確屬上游無法避免，記錄原因與後續縮減方案後再決定。

### 3.2 [P2] 評鑑表單 Rules 仍可重複提交與逾期建立（已移出本分支）

> **決議（2026-11-07）**：使用者決定本項不納入 `codex/angularfire-21-upgrade` 改動範圍，已開立 [NOAHXDM/NGEip#42](https://github.com/NOAHXDM/NGEip/issues/42) 另案處理。本分支只需在 CHANGELOG 或實作驗證紀錄註明「重複提交、create 截止日檢查與指派 update 收斂為已知缺口，見 #42」，不修改 Rules。以下保留原始審查內容供 issue 參考。

`5f56633` 的修正方向正確，測試完整，已封住「未被指派仍可替他人建立表單」。但 `firestore.rules` 的 `evaluationForms` create 規則仍有兩個既有缺口：

- **同一指派可建立多份表單**：表單 ID 由 `doc(collRef)` 自動產生，create 規則未檢查指派狀態或表單 ID。被指派者可繞過服務，直接以 SDK 對同一指派寫入任意多份表單，影響彙整分數。
- **create 未檢查截止日**：update 規則有 `deadline > request.time`，create 沒有。

此外，`evaluationAssignments` 的 update 規則允許評核者在身分欄位不變的前提下任意修改自己的指派（例如 status），同屬既有授權問題。

CHANGELOG 目前寫「修正未被指派仍可替他人建立表單的 Rules 缺口」，敘述本身正確，但讀者可能誤認為表單寫入權限已全面收斂。

建議（擇一，需使用者決定是否納入本分支）：

- **方案 A（建議）**：表單 ID 固定為 `assignmentId`（或 rules 要求 `formId == request.resource.data.assignmentId`），create 同時要求 `get(assignment).data.status == 'pending'` 並檢查週期截止日；同步調整 `EvaluationFormService`、既有資料相容性（歷史表單 ID 非 assignmentId）與 Emulator 測試。
- **方案 B**：使用 `getAfter()` 要求同一 batch 內指派由 `pending` 轉為 `completed` 且記錄此表單 ID，並收斂指派 update 只允許該轉換。
- **方案 C**：本分支不處理，於 CHANGELOG／驗證紀錄明列「重複提交與 create 截止日檢查為已知缺口」，另開工作。

無論選擇何者，`firestore.rules` 與 `specs/002-peer-evaluation/contracts/firestore-rules-contract.md` 必須同步。

### 3.3 [P3] Commit 訊息不符合專案慣例

4 個實作 commit 皆為英文且無內文，例如 `build: migrate Angular and AngularFire to version 21`。專案慣例與 CLAUDE.md 要求繁體中文、`type(scope): 摘要`，並於內文說明背景、變更與測試（參考 `f45c418`）。`76ba2d8` 同時包含依賴、CI、測試基礎設施、Service Worker 與文件，未依計畫拆分。

建議：開 PR 前以非互動方式重寫 commit 訊息（必要時拆分 `76ba2d8`），例如：

- `build(deps): 升級 Angular、CLI 與 AngularFire 至 21`
- `build(deps): 升級 Material 與 CDK 至 21`
- `build(deps): 對齊 Firebase 12 與 ng-matero 21，CI 改用標準 npm ci`
- `test(evaluation): 建立評鑑 Emulator 整合測試 runner`
- `fix(evaluation): 評鑑表單須對應既有指派並禁止自評，更新至 4.6.0`

### 3.4 [P3] 測試 target 全域停用 sourcemap

`angular.json` test target 新增 `"sourceMap": false`，原因為開啟時完整 Karma 尚未執行案例即斷線。README 已說明除錯可加 `--source-map=true`，可接受，但根因（推測為 Chrome Headless 記憶體或 bundle 載入逾時）未調查。

建議：在驗證紀錄記錄重現條件與失敗訊息；若為記憶體問題，評估調整 `browserNoActivityTimeout` 或 Chrome flags，而非長期關閉。

### 3.5 [P3] 新增程式註解為英文

例如 `src/app/attachments/testing/firestore-rules.spec.ts` 開頭的 `Reference contract only; ...`，以及 `src/app/evaluation/testing/firestore-rules.spec.ts` 的 `Firebase Emulator integration contract.`。專案其餘註解使用繁體中文。

建議：改為繁體中文。

## 4. 發布前仍未驗證

以下項目本次審查同樣無法代為驗證，維持「未驗證」狀態：

- HTTPS 測試站實機 FCM：前景／背景推播、拒絕權限、token 註冊與登出清理、通知點擊導頁、舊 worker 更新。
- 瀏覽器人工回歸：登入／登出／session 還原、日期元件與台北時區、跨日出勤、附件上傳／預覽／刪除、Safari／Edge 截圖。
- 發布前記錄 Hosting `SITE_ID`／`VERSION_ID` 並確認版本保留設定。
- 部署順序：先 Firestore Rules 後 Hosting；Hosting rollback 不會回復 Rules。

## 5. 建議處理順序

1. 3.2 已移出本分支（[#42](https://github.com/NOAHXDM/NGEip/issues/42)）；本分支僅補已知缺口註記。
2. 3.1 分析 bundle 增量並更新驗證紀錄。
3. 3.4、3.5 小幅修正。
4. 3.3 重寫 commit 訊息後再 push 與開 PR（PR 使用 merge commit）。
5. 完成第 4 節人工驗證後才進入正式發布。

Codex 完成上述項目後，由審查者重新執行第 2 節驗證指令並更新本文件。

## 6. Codex 處理紀錄（2026-11-07）

保留上方 Claude 原始審查與獨立驗證結果；以下為後續處置，不代表 Claude 已重新審查。

| 項目 | 處理結果 |
| --- | --- |
| 3.1 bundle | 獨立重建 f45c418 與升級版 stats，確認 +245,648 bytes；re2js +149,716、Firestore +60,458 合占 85.56%。新增可重現分析工具與比較 JSON，驗證紀錄補入新 warning、provider 未改動及後續路由／推播延遲載入方案。budgets 未提高。 |
| 3.2 #42 | CHANGELOG／驗證紀錄明列重複提交、create 截止日與指派 update 缺口；本輪 Rules 與契約未變更。 |
| 3.3 commit | 確認遠端無此分支後，重寫本機訊息並拆分原 76ba2d8；各筆都有繁體中文 scope、背景、變更與驗證內文。重寫前後最終 tree 相同，備份於 refs/backup/angularfire-21-before-review。 |
| 3.4 sourcemap | 記錄原始 30 秒無訊息斷線條件；開啟 sourcemap 重跑通過、未重現，無 OOM 證據。恢復 test target 預設 sourcemap，未更動 timeout 或 Chrome flags。 |
| 3.5 註解 | 本分支新增的附件／評鑑測試註解及跨 SDK 案例名稱改為繁體中文。 |

後續驗證：預設 `npm test -- --watch=false` 369 通過（86 項為獨立整合／參考契約），`npm run test:evaluation-integration` 76 通過；`npm run build -- --stats-json` 通過，仍有已量化的 2.5 MB warning。本次未改依賴版本，未重跑安裝；先前嚴格安裝結果仍適用。

原始審查的 commit 對照如下（以舊 SHA 保留歷史證據）：

| 舊 commit | 重寫後 commit |
| --- | --- |
| `a2580a1` | `cf68d6d` |
| `500aafa` | `1557cf0` |
| `cd18bff` | `f3f6bb9` |
| `76ba2d8` | `743eafb`, `f7d2567`, `20e0d32` |
| `5f56633` | `a13f843` |

完整分析與未完成的人工發布門檻見 [實作驗證紀錄](2026-11-07-angularfire-21-validation.md)。尚未 push、建立 PR 或部署；本文件第 4 節仍維持未驗證。

## 7. 複審結果（Claude，2026-11-07）

對象：`cf68d6d..bd5c70f`（重寫後 9 個 commit），對照第 6 節 Codex 處理紀錄逐項複核。

### 7.1 逐項結論

| 項目 | 結論 | 複核依據 |
| --- | --- | --- |
| 3.1 bundle | ✅ 已處置 | `npm ls re2js` 確認 `firebase@12.19.0 → @firebase/firestore@4.17.2 → re2js@2.9.1`，且 `@firebase/firestore/dist/index.esm.js` 靜態 `import 're2js'`，與 Codex 歸因一致。`tools/analyze-initial-bundle.mjs` 沿 main／polyfills／styles 靜態 import 追蹤並排除 dynamic-import，方法合理。budgets 未變更。升級前 transfer 數字差異（512.50 vs 512.69 kB）為兩次獨立重建的估算誤差，不影響結論。 |
| 3.2 #42 | ✅ 已處置 | CHANGELOG「已知缺口」與驗證紀錄「後續追蹤」皆連結 #42；`firestore.rules` 與契約文件本輪未變更。 |
| 3.3 commit | ✅ 已處置 | 9 個 commit 皆為繁體中文 `type(scope): 摘要` 並含背景／變更／驗證內文；原 `76ba2d8` 拆為 3 筆。`git diff 5f56633 a13f843` 為空，確認重寫未改變程式內容；備份 ref `refs/backup/angularfire-21-before-review` 存在；遠端尚無此分支，重寫不影響他人。 |
| 3.4 sourcemap | ✅ 已處置 | `angular.json` test target 已移除 `sourceMap: false`；預設 sourcemap 下完整 Karma 369 項通過，未重現斷線。診斷紀錄未誇大為記憶體問題，並寫明再次重現時的處理步驟。 |
| 3.5 註解 | ✅ 已處置 | 附件與評鑑測試新增註解及跨 SDK 案例名稱已改為繁體中文。 |

另確認 Codex 同步更新 `CLAUDE.md` 的 Angular 版本描述（20 → 21），屬合理的文件一致性修正。

### 7.2 重跑驗證（HEAD `bd5c70f`）

| 檢查 | 結果 |
| --- | --- |
| `npx tsc -p tsconfig.spec.json --noEmit`、`npx tsc -p tsconfig.app.json --noEmit` | ✅ 通過 |
| `npm test -- --watch=false`（預設 sourcemap） | ✅ 369 通過 |
| `npm run test:evaluation-integration` | ✅ 76／76 通過 |
| `npm run build` | ✅ 通過；initial 2.60 MB／傳輸 566.20 kB，2.5 MB warning 仍在（已量化、已歸因） |
| 嚴格安裝 | 本輪依賴未變更，沿用第 2 節 `npm ci --dry-run` 通過結果 |

### 7.3 審查結論

第 3 節所有審查項目皆已處置，程式層面可進入 push 與建立 PR（使用 merge commit）。**尚不可發布**，發布前仍需：

1. ~~決定 bundle warning 的處置~~ **已決議（2026-11-07）**：使用者接受 +245,648 bytes 的 Firebase 12 成本，本次不縮減、不調整 budgets；PR 說明需記錄此決議。route `loadComponent`／Messaging 延遲載入列為後續優化，由 [#43](https://github.com/NOAHXDM/NGEip/issues/43) 另案處理。
2. 完成第 4 節的 FCM 實機測試、瀏覽器人工回歸與 Hosting `SITE_ID`／`VERSION_ID` 記錄。
3. 部署順序：先 Firestore Rules（含 `a13f843` 指派一致性修正），後 Hosting。

PR 合併後可刪除備份 ref `refs/backup/angularfire-21-before-review`。
