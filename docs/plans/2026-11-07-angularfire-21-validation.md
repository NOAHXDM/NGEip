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
| Karma（預設 sourcemap） | 369 通過；86 略過（76 評鑑＋4 歷程整合、6 附件參考契約）為獨立 emulator／參考契約 |
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

第一次 sandbox production build 非正常退出；取得完整執行環境後 production/development 皆通過。Karma 曾在 sourcemap 開啟時於案例開始前斷線，原先以關閉 sourcemap 暫解；審查後重跑未重現，已恢復預設 sourcemap，詳見下方診斷紀錄。

評鑑測試先前全部 xdescribe，且使用 browser 不支援的 Node require。現改為 opt-in runner、fetch Rules、demo project，以及每案例 cleanup，避免累積連線造成逾時。原測試「非管理者不能修改完成計數」與既有 specs/002-peer-evaluation/plan.md 的完成計數例外衝突，改為驗證不能修改 totalAssignments，沒有改變 Rules。

## 已核准的 Rules 修正

使用者於 2026-11-07 核准在本分支修正未指派寫入缺口。Rules 現在要求既有指派，並核對評核者、受評者與週期，禁止自評；一般評核者更新表單也必須符合指派，管理者維護權限保留。服務在建立 batch 前檢查一致性，6 項新增單元案例涵蓋 pending/completed 的三種不一致。

新增 13 項整合案例涵蓋缺失／不存在／格式錯誤／借用指派、錯誤身分與週期、自評、歷史指派刪除，以及真正呼叫 EvaluationFormService 的四筆 batch 與 completed 更新。原本失敗的偽造表單斷言保留且已通過。型別檢查、完整 Karma 與 production build 在修正後重跑通過。此次不更動截止日、計數與快照的既有授權政策。

發布需部署 Firestore Rules 與 Hosting；建議先 Rules 後前端。對缺失／已刪除／錯配指派的歷史表單，一般評核者將不能修改，需由管理者處理。Hosting rollback 不會回復 Rules，應保留本次權限修正。

## 發布前尚需完成

- HTTPS 測試站實機 FCM 前景／背景、token 清理、通知點擊與舊 worker 更新，CDN 200 無法替代功能驗證。
- 登入／登出／session 還原、日期元件與台北時區、附件 UI、Safari/Edge 人工回歸與截圖。
- 發布前記錄 Hosting SITE_ID/VERSION_ID 並確認保留窗口；未執行任何 deploy。

## Bundle 增量調查（審查 3.1）

已在獨立暫存來源還原 `f45c418`，使用其 lockfile 執行 `npm ci --legacy-peer-deps`（只用於升級前基線），與升級版使用相同 Node 22.23.4、production 設定及 `ng build --stats-json` 比較。未修改 budgets。

| 指標 | 升級前 | 升級後 | 增量 |
| --- | --- | --- | --- |
| Initial raw | 2,357,494 bytes | 2,603,142 bytes | 245,648 bytes（10.42%） |
| CLI estimated transfer | 512.50 kB | 566.20 kB | 53.70 kB |
| 2.5 MB warning | 無 | 超出 103.14 kB | 本次升級新增 |

Claude 審查記錄的 baseline estimated transfer 為 512.69 kB；上表是本次獨立重建結果，皆為 CLI 壓縮估算而非瀏覽器實測傳輸。raw 與 warning 的結論一致。

以 esbuild metafile 沿 main/polyfills/styles 的靜態 import 遞迴追蹤、排除 dynamic-import，彙總各 input 的 bytesInOutput：

| 模組 | 升級前 bytes | 升級後 bytes | 增量 bytes |
| --- | ---: | ---: | ---: |
| re2js | 0 | 149,716 | +149,716 |
| @firebase/firestore | 199,943 | 260,401 | +60,458 |
| @angular/material | 673,758 | 704,426 | +30,668 |
| @angular/cdk | 193,702 | 187,169 | −6,533 |
| @firebase/messaging | 13,340 | 19,757 | +6,417 |
| @angular/fire | 5,922 | 5,958 | +36 |
| @ng-matero/extensions | 114,914 | 114,683 | −231 |

完整結果見 [模組比較 JSON](../validation/angularfire-21-bundle-comparison.json)。可重現命令：

```sh
node tools/analyze-initial-bundle.mjs <baseline-stats.json> <upgrade-stats.json>
```

Firebase 12.19.0 所用的 @firebase/firestore 4.17.2，其 `dist/common-CLMydGSF.esm.js` 引入 RE2JS 並用於 regex 運算；編譯後 re2js 與 Firestore 合計占總增量約 85.56%。AngularFire 與 ng-matero 本身的增量很小。`src/app/app.config.ts` 相對 `f45c418` 沒有變更；Storage 升級前／後皆約 22,961 bytes，Messaging 也在兩版 initial 中，不是這次 provider 初始化使原 lazy 模組提前載入。

目前鎖定版本透過正式 Firestore SDK 入口保留這些程式；不藉由覆寫 SDK 私有入口、刪除 re2js 或忽略 side effects 縮小 bundle。此結論限於本次依賴樹，不宣稱所有 Firebase 12.x 都有相同體積。

後續縮減方案：優先將仍以靜態 import 載入的 Home/MyProfile/Users/SystemConfig 改為 route loadComponent，量測登入頁與登入後首屏下載量；另評估使用者啟用推播時才載入 Messaging。這些變更需要路由、登入重導及推播生命週期回歸，本次不混入升級修正。新 warning 保留，發布前須明確接受此成本或完成縮減，不能以提高 budget 消除。

## Sourcemap 診斷（審查 3.4）

- 原始重現：2026-11-07 00:15，Node 22.23.4／Chrome Headless 156／完整 Karma、sourcemap 開啟，瀏覽器連線後尚未回報案例，兩次發生 `Disconnected, because no message in 30000 ms.`。當時另有 production/development build 與 emulator 工作；沒有 Chrome OOM、crash dump 或記憶體使用量證據，不能判定為記憶體不足。
- 2026-11-07 09:23 以 `npm test -- --watch=false --source-map=true` 重跑（並行 production baseline／升級版 stats build），369 項通過，沒有斷線。暫時關閉 sourcemap 的依據不足以支持全域長期關閉，故移除 test target 的 sourceMap override，保留 Karma 既有 timeout／Chrome flags。
- 恢復預設後再執行標準 `npm test -- --watch=false`，369 項通過；專用評鑑 runner 76 項亦全部通過。
- 若再次重現，先保留完整 log、對照單獨執行與並行負載，再以延長 browserNoActivityTimeout 的暫時設定區分載入延遲，並取得 Chrome 記憶體／崩潰證據；未證實前不調高限制或新增 Chrome flags。`--source-map=false` 僅保留為診斷對照。

## 後續追蹤

AngularFire 22 正式發布後重新查核 Angular 22、Material/ng-matero 22 的 peers 與支援期，另案升級。Component 資料存取集中至 service 的既有技術債另案處理。

已知評鑑缺口：重複提交、create 截止日檢查與指派 update 收斂，依審查文件記錄的使用者決議由 [#42](https://github.com/NOAHXDM/NGEip/issues/42) 另案處理，本次不再修改 Rules。指派一致性修正不代表評鑑寫入權限已全面收斂。
