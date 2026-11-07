# AngularFire 21 實作驗證紀錄

日期：2026-11-07。分支：`codex/angularfire-21-upgrade`。本紀錄不代表已部署。

## 實際版本與 migration

Angular 21.2.26；CLI/build-angular 21.2.29；AngularFire 21.0.0；Firebase 12.19.0；TypeScript 5.9.3；Material/CDK/date-fns adapter 21.2.14；ng-matero extensions 21.3.1／adapter 21.0.0。

已執行 Angular/core/CLI/AngularFire 與 Material schematics。AngularFire 自動新增 firebase ^12.18.0；未發現需要改寫的 Vertex AI。CLI 移除冗餘 tsconfig lib（仍由 ES2022 target 提供預設 lib）。保留 Zone.js 與 Karma。

`npm ci` 不加 legacy-peer-deps/force 已通過。`npm ls` 無 invalid peer；Firebase 12.19.0 共用同一安裝。版本輸出見 [依賴樹](../validation/angularfire-21-dependencies.txt)。Functions 仍使用 firebase-admin 14.3.0、firebase-functions 7.3.2、獨立 TypeScript 5.8.3，與升級前相同。

## 已執行

| 檢查 | 結果 |
| --- | --- |
| spec TypeScript noEmit | 通過 |
| production build | 通過；initial 2.60 MB，超過 2.5 MB warning，低於 3 MB error；未提高 budgets |
| development build | 通過 |
| Karma（停用 sourcemap） | 369 通過；86 略過（76 評鑑＋4 歷程整合、6 附件參考契約）為獨立 emulator／參考契約 |
| Functions | 47 通過 |
| JSM 部署設定 | 6 通過 |
| 附件 orphan audit | 1 通過 |
| 附件 Rules emulator | PASS |
| 出勤 Rules emulator | PASS |
| 歷程 Rules emulator | PASS |
| 歷程 Angular integration | 4 通過 |
| 評鑑 Angular integration | 76 通過；含跨 SDK reference/Timestamp、指派一致性及實際服務 batch／completed 修改測試 |
| 週報 Emulator | 7 通過 |
| FCM CDN | app-compat 與 messaging-compat 12.19.0 均 HTTP 200 |

第一次 sandbox production build 非正常退出；取得完整執行環境後 production/development 皆通過。完整 Karma 在 sourcemap 開啟時尚未開始案例即斷線，關閉 sourcemap 後通過，因此只調整 test target 的 sourceMap；應用 build 設定不變。

評鑑測試先前全部 xdescribe，且使用 browser 不支援的 Node require。現改為 opt-in runner、fetch Rules、demo project，以及每案例 cleanup，避免累積連線造成逾時。原測試「非管理者不能修改完成計數」與既有 specs/002-peer-evaluation/plan.md 的完成計數例外衝突，改為驗證不能修改 totalAssignments，沒有改變 Rules。

## 已核准的 Rules 修正

使用者於 2026-11-07 核准在本分支修正未指派寫入缺口。Rules 現在要求既有指派，並核對評核者、受評者與週期，禁止自評；一般評核者更新表單也必須符合指派，管理者維護權限保留。服務在建立 batch 前檢查一致性，6 項新增單元案例涵蓋 pending/completed 的三種不一致。

新增 13 項整合案例涵蓋缺失／不存在／格式錯誤／借用指派、錯誤身分與週期、自評、歷史指派刪除，以及真正呼叫 EvaluationFormService 的四筆 batch 與 completed 更新。原本失敗的偽造表單斷言保留且已通過。型別檢查、完整 Karma 與 production build 在修正後重跑通過。此次不更動截止日、計數與快照的既有授權政策。

發布需部署 Firestore Rules 與 Hosting；建議先 Rules 後前端。對缺失／已刪除／錯配指派的歷史表單，一般評核者將不能修改，需由管理者處理。Hosting rollback 不會回復 Rules，應保留本次權限修正。

## 發布前尚需完成

- HTTPS 測試站實機 FCM 前景／背景、token 清理、通知點擊與舊 worker 更新，CDN 200 無法替代功能驗證。
- 登入／登出／session 還原、日期元件與台北時區、附件 UI、Safari/Edge 人工回歸與截圖。
- 尚未建立升級前 production bundle 大小基線，不能宣稱 2.60 MB warning 為新增或既有。
- 發布前記錄 Hosting SITE_ID/VERSION_ID 並確認保留窗口；未執行任何 deploy。

## 後續追蹤

AngularFire 22 正式發布後重新查核 Angular 22、Material/ng-matero 22 的 peers 與支援期，另案升級。Component 資料存取集中至 service 的既有技術債另案處理。
