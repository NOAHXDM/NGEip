# AngularFire 21 升級實作與驗證計畫

日期：2026-11-06。範圍：現有 Repository 的升級規劃；本文件不代表已完成套件升級或部署。

本次已執行基線：HEAD `f45c418`；現有 node_modules 下 `tsc -p tsconfig.spec.json --noEmit` 通過。尚未執行乾淨安裝、完整 build、Karma、Emulator 或 FCM 驗證；目前結果不能代表升級後通過。

審查補充（2026-11-06）：已實際查詢 npm registry 並驗證版本與 peers（見第 1 節）；現有 lockfile 執行不帶 legacy 旗標的 `npm ci --dry-run` 會失敗，證實升級時必須重新產生 lockfile。

## 1. 結論與版本決策

AngularFire 21.0.0 已正式發布，需要 Angular 21.2 以上、Firebase JS SDK 12.18 以上，以及 rxfire 6.2 以上。應一次對齊 Angular 與 AngularFire，避免先單獨升 Angular 時被既有 AngularFire 20 的 peer dependencies 擋下。來源：[21.0.0 release](https://github.com/angular/angularfire/releases/tag/21.0.0)、[版本固定的 package manifest](https://github.com/angular/angularfire/blob/21.0.0/src/package.json)。

| 套件／環境 | Repository 現況（lockfile） | 實作目標與理由 |
| --- | --- | --- |
| Angular framework | 20.3.30 | 21.2.x 維護版本（registry `v21-lts` = 21.2.26）；core/common/compiler/forms/router/platform-browser/animations/compiler-cli 同步 |
| CLI／build-angular | 20.3.35 | 21.x，採相容的 21.2 維護版本；保留既有 application/Karma builder |
| AngularFire | 20.0.1 | 21.0.0 起的穩定 21.x；不用 next 或不帶版本的 latest |
| Firebase JS SDK | 11.10.0，根 package.json 未直接宣告 | 明確新增 firebase ^12.18.0；lockfile 鎖定驗證過的單一 12.x |
| rxfire | 6.1.0（AngularFire 間接依賴；peers 僅到 firebase ^11） | 6.2.x 以上（6.2.0 peers 已含 firebase ^12），由依賴解析管理 |
| TypeScript | 5.8.3 | 根目錄 ~5.9.0；Angular 21 要求 >=5.9 <6 |
| Material／CDK／Material date-fns adapter | 20.2.14 | 同步 21.2.x（registry 最新 21.2.14）；三者使用互相匹配的版本，執行 Material migration |
| ng-matero extensions／adapter | 20.4.1／20.0.0 | extensions 21.3.1／adapter 21.0.0（peers 皆為 >=21.0.0）。**禁止安裝 latest**：latest 已是 22.1.2／22.0.0，peers 要求 Angular 22 |
| RxJS／zone.js | 7.8.2／0.15.1 | 保留 7.8.x／0.15.x（Angular 21 接受 zone.js ~0.15 或 ~0.16） |
| date-fns／date-fns-tz | ^3.6.0／^3.2.0 | 先保留；若目標 adapter peers 要求再調整，並驗證日期時區 |
| rules-unit-testing | 5.0.0，要求 Firebase ^12 | 可保留；目前 Firebase 11 與此 peer 不一致，升級必須消除此問題 |
| Node | 本機 22.23.4；CI 22；Functions 22 | 保留 Node 22，最低 22.12；記錄／固定開發與 CI 使用版本 |
| Firebase CLI／Java | CI 14.27.0／21 | 先保留，AngularFire 21 支援 CLI 14 或 15；不因 Web SDK major 自動升 CLI |
| firebase-admin／firebase-functions | ^14.3.0／^7.3.2 | 無須跟隨 Web SDK major；保留並執行 Functions 回歸 |

Angular 21 的 Node／TypeScript／RxJS 範圍以[官方相容表](https://angular.dev/reference/versions)為準。Functions 有自己的 TypeScript ~5.8.0，可以獨立保留；若決定統一到 5.9，必須在同一階段跑 Functions build/tests。@types/node 目前為 25.x，可另評估對齊 Node 22 型別，但不是 AngularFire 的硬性要求。

精確 patch 在執行前再查一次 npm registry 並記錄。2026-11-06 審查時已查核：`@angular/fire@21.0.0` peers 為 `@angular/core|common|platform-browser ^21.2.0`、`rxjs ~7.8.0`、`typescript >=5.8 <6.0`、`firebase-tools ^14 || ^15`（後兩者為 optional），dependencies 含 `firebase ^12.18.0`、`rxfire ^6.2.0`；已不再要求 platform-browser-dynamic／platform-server。上游 main 已出現 AngularFire 22 開發內容，因此以 21.0.0 tag 與目標 npm 發行包為準。

### 升級時機與後續追蹤

registry 上 Angular `latest` 已是 22.2.4；Angular 20 的 LTS 約於 2026-11 結束，Angular 21 LTS 約至 2027-05。AngularFire 22 尚未正式發布，因此 21 是目前可達的上限，本次升級屬於**過渡版本**。交付時需建立追蹤項目：AngularFire 22 正式發布且 ng-matero／Material 22 peers 對齊後，即規劃升至 Angular 22，避免在 v21 LTS 結束前被迫倉促升級。

## 2. Breaking Changes 與程式應對

### 必須處理：Firebase SDK 一致性

`src/app/evaluation/models/evaluation.models.ts`、evaluation/journey 測試等直接 import `firebase/firestore`；其他 services 多數使用 AngularFire re-export。這種用法不必全面改寫，但兩條路徑必須解析到同一個 Firebase 實例套件，避免 Timestamp、DocumentReference 等跨版本物件在執行期遭拒。

直接 import `firebase/*` 的位置不只 models 與測試，也包含 `src/app/evaluation/services/evaluation-cycle.service.ts` 與 `src/app/evaluation/pages/evaluation-tasks/evaluation-tasks.component.ts`（另有 12 個 spec）。全部列入同一實例檢查範圍。component 直接 import Firebase 違反「Firebase 存取集中於服務層」原則，屬既有技術債，本次不擴大範圍修正，但需登記為後續項目。

根 package.json 新增直接 firebase dependency，檢查 `npm ls firebase rxfire @firebase/rules-unit-testing`；確認沒有 firebase 11、沒有 invalid peer、重複列出的 firebase 都是同一安裝實體的 deduped 引用。

### 必須處理：lockfile 重新產生與 workspace

CI 目前 `.github/workflows/ci.yml` 使用 `npm ci --legacy-peer-deps`。審查時以現有 lockfile 執行不帶旗標的 `npm ci --dry-run` 已確認會失敗，因此**只移除 CI 旗標不夠**：必須在不使用 legacy-peer-deps／force 的情況下以 `npm install` 重新產生 package-lock.json，再於乾淨環境（刪除 node_modules）執行一般 `npm ci` 驗證。不得用 force/legacy-peer-deps 作為成功標準。

根目錄宣告 `workspaces: ["functions"]`，根層 `npm install`／`npm ci`／`npm ls` 都會一併解析 functions workspace。functions 保留 TypeScript ~5.8 時，會與根目錄 ~5.9 並存；需確認 `npm run functions:build` 實際使用 functions 自己的 tsc（`functions/node_modules/.bin/tsc` 或解析結果明確），且 lockfile 變動中 firebase-admin／firebase-functions 版本未被意外改動。

### 必須驗證：Messaging Service Worker

`tools/generate-firebase-messaging-sw.mjs` 從 lockfile 的 `node_modules/firebase` 版本產生 CDN compat script；`public/firebase-messaging-sw.js` 隨版本更新。`prebuild`／`prewatch` 每次都會執行 generator；內容只在 Firebase SDK 版本或設定改變時才產生 diff（本次升級會改變 SDK 版本），需與 lockfile 一起提交。確認兩個 CDN import 都與根 SDK 版本一致，並以 `curl -sfI` 確認 `https://www.gstatic.com/firebasejs/<版本>/firebase-app-compat.js` 與 `firebase-messaging-compat.js` 實際存在（新 patch 可能尚未上 CDN），再驗證前景通知、背景推播、通知點擊導頁、允許／拒絕權限、token 註冊與登出清理、舊 worker 更新至新 worker。Worker 使用 compat CDN 不等於 Angular 應用需要改用 AngularFire compat。

FCM 無法只靠 Firestore／Storage Emulator 證明；使用隔離的測試 Firebase 專案與 HTTPS 測試站，向測試裝置發送訊息，記錄 Chrome／Edge 與支援推播的 Safari 情境。

### 保留 Zone.js；檢查 Injection Context

`src/app/app.config.ts` 已明確使用 `provideZoneChangeDetection({ eventCoalescing: true })`，`angular.json` 有 zone.js 與 zone.js/testing。Angular 21 預設 zoneless，但顯式 provider 可維持現有行為，見[官方說明](https://angular.dev/guide/zoneless)。本次保留設定，不合併 zoneless 改造。

檢查 authState、collectionData、docData 等訂閱建立點及非同步回呼；已有 `runInInjectionContext` 的 user/system-config/meal-subsidy/attendance-stats services 應維持正確同步邊界。若有警告／NG0203，針對重現路徑修正，注意 injection context 不會自動跨越 await。驗證登入後 UI、即時資料與權限切換能自行更新。這是既有使用方式的回歸風險，不直接判定為 v21 新增破壞。

### Material 與日期元件

`attendance.component.ts`、`user-profile.component.ts` 使用 MtxDatetimepicker 與 ng-matero date-fns adapter；`src/styles.scss` 匯入 ng-matero 預建 theme，`angular.json` 匯入 Material theme。執行 Material migration 後檢查日期輸入／解析、繁中顯示、台北時區、跨日出勤、dialog/overlay、鍵盤操作、disabled/error 狀態與版面。

Material 20 現有 peers 接受 Angular 21，ng-matero 20 的 peers 也沒有嚴格上限；因此同步 UI major 是維護一致性的建議，不是憑 major 數字認定必須。若 ng-matero 21 的實際發布／相容性有阻礙，可先驗證保留 20 的方案，記錄依據再決定。

### 官方變更目前不適用／不必擴大範圍

掃描 src/tools 未發現 Vertex AI、Imagen 或 App Check 使用，angular.json 沒有 SSR target。故 Vertex AI → AI Logic、預設 region 改變、Imagen API 移除，以及 SSR AppCheck 回傳 null 暫無修改點；升級 migration 後再掃一次確認。詳見[官方 v21 guide](https://github.com/angular/angularfire/blob/main/docs/version-21-upgrade.md)。

`platform-browser-dynamic` 被移除的是 AngularFire 的 peer 要求，不代表應用被要求立即刪掉套件；先檢查 Karma 測試啟動需求，保留時同步 21。`provideAnimationsAsync` 與 APP_INITIALIZER 的現代化另案處理，除非目標編譯／migration 明確要求。保留 Karma/Jasmine；[官方測試文件](https://angular.dev/guide/testing)仍支援 Karma，Vitest 不作為本次必要遷移。

## 3. 實作順序與提交切分

0. **前置**：`ng update` 會拒絕在有未提交變更（含 untracked）的工作樹執行；先提交 `docs/`（含本計畫）或移出工作樹。
1. **基線與依賴確認**：記錄 HEAD、lockfile、Node/npm、測試數與 skip 數、build 大小。現有 main 領先 origin/main 一個 commit，實作從當前 HEAD 建立 `codex/angularfire-21-upgrade`，保留該 commit。查目標 Angular/Material/ng-matero/Firebase 的版本與 peers；建立升級前測試結果清單。
2. **原子化套件升級**：在乾淨工作樹執行下列固定 major 指令，review 每個 schematic diff。新增 firebase ^12.18.0、確認 TypeScript 5.9；同步 UI 套件與 adapters（ng-matero 指定 21.x）。若 peers 擋住，調整同批升級集合或分階段保留相容 UI major，不能跳過檢查。最後不帶 legacy-peer-deps 重新產生 lockfile。
3. **程式與 worker 修正**：修正實際編譯錯誤、context／型別問題；重新產生 worker；完成 UI 與 Firebase 回歸。package.json、lockfile、必要程式變更共同保持可安裝狀態。
4. **驗證與 CI**：移除 legacy-peer-deps，補 CI 的 Rules／audit 步驟；為評鑑整合測試建立明確 opt-in emulator runner 與隔離資料，避免直接取消 xdescribe 後讓一般單元測試連線。加入同一 Firebase 實例跨 import 路徑的讀寫測試。
5. **版本號與文件**：依專案慣例將版本由 4.5.3 提升至 **4.6.0**（相依框架 major 升級），同步 package.json、package-lock.json、README「目前版本」與 CHANGELOG（記錄版本矩陣、移除 legacy-peer-deps、worker SDK 版本與 v22 追蹤項目）。
6. **發布準備**：附版本矩陣、migration 警告處理、測試結果與截圖、bundle 差異、測試站 FCM 結果。所有 gate 通過才進入正式發布流程；PR 使用 merge commit，不 squash。

預計執行的主要命令（本規劃階段未執行）：

```sh
npx ng update @angular/core@21 @angular/cli@21 @angular/fire@21
# review diff 後提交（ng update 預設 --allow-dirty=false，未提交會擋下一次 update）
git add -A && git commit
npx ng update @angular/material@21
# review diff 後提交
git add -A && git commit
npm install firebase@^12.18.0 @ng-matero/extensions@^21.3.1 @ng-matero/extensions-date-fns-adapter@^21.0.0
npm run generate:messaging-sw
rm -rf node_modules && npm ci
npm ls @angular/core @angular/fire firebase rxfire @firebase/rules-unit-testing
```

兩次 `ng update` 之間必須先 review schematic diff 並提交；不使用 `-C/--create-commits`，避免未經 review 就自動提交 migration 結果。

manifest 依專案慣例使用 `^` 範圍，實際安裝版本由 lockfile 固定。上列版本依 2026-11-06 registry 查核填入；執行前以下列指令重新查核，交付時附 `npm ls` 輸出作為證據：

```sh
npm view @angular/fire@21 version peerDependencies dependencies
npm view @angular/core dist-tags
npm view @ng-matero/extensions@21 version peerDependencies
npm view @ng-matero/extensions-date-fns-adapter@21 version peerDependencies
npm view rxfire@6.2 version peerDependencies
```

若選擇手動改 manifest，必須補跑對應版本 migration，不能只改版本號。

## 4. 驗證矩陣與放行門檻

| 層級 | 執行內容 | 通過條件 |
| --- | --- | --- |
| 安裝 | 乾淨環境 npm ci；npm ls | 不使用 force/legacy-peer-deps；無 invalid peers；單一 Firebase 12 實例 |
| 編譯 | `npx tsc -p tsconfig.spec.json --noEmit`；`npm run build`；`npx ng build --configuration development` | 無 TS/template 錯誤；正式 build 仍遵守 initial 3MB 與 component style 6kB error budgets；比較警告與大小基線 |
| 單元 | `npm test -- --watch=false` | 原有案例通過，沒有為了升級新增 skip；列出既有 skip |
| Functions | `npm run functions:test`；`npm run test:jsm-weekly-deployment` | backend build、契約與部署設定測試通過 |
| Emulator | 下列現有 scripts，依序執行避免 port 衝突 | demo project、測試資料隔離；成功／拒絕路徑皆通過 |
| 評鑑 | 新增專用 runner 執行 evaluation rules、US1–US4 | 案例實際執行而非 xdescribe；不可用一般 npm test 綠燈代替 |
| 瀏覽器 | 登入／登出、重整還原 session、admin guard、出勤／補助／評鑑 CRUD 與即時更新 | 無新 context/SDK identity 錯誤；權限與 UI 行為符合基線 |
| Storage | 附件上傳、預覽、下載、刪除；拒絕無權限操作；取消與重試 | metadata/檔案一致，錯誤與進度 UI 正確 |
| FCM | 測試站實機前景／背景、拒絕權限、不支援瀏覽器、worker 更新 | 不影響登入／主要功能；推播與點擊導頁通過 |

現有 emulator 與 audit 命令：

```sh
npm run test:attachment-audit
npm run test:attachment-rules
npm run test:attendance-rules
npm run test:journey-rules
npm run test:journey-integration
npm run test:jsm-weekly
```

環境前提：Node 22.12+、CI 固定的 Firebase CLI 14.27.0、Java 21、Chrome/CHROME_BIN、可取得 Emulator binaries。現有 CI 有 journey 與 weekly 測試，但尚未執行 attachment-rules、attendance-rules、attachment-audit。evaluation 的 rules 與 US1–US4 目前皆 xdescribe，屬已存在的測試缺口。

另有 `src/app/attachments/testing/firestore-rules.spec.ts` 與 `storage-rules.spec.ts` 同樣為 xdescribe；附件規則目前實際由 `npm run test:attachment-rules`（Node emulator 腳本）覆蓋。需在計畫交付中明確記錄兩者分工：若 emulator 腳本已等價覆蓋，Karma 版標註為保留契約參考或移除；若未覆蓋，比照評鑑建立 opt-in runner。journey 的 us1-integration 已有專用 Karma 設定（`test:journey-integration`），可作為評鑑／附件 runner 的範本。

## 5. 回復與交付

本次不規劃資料 schema／Rules 語意變更。若需額外資料遷移，另列方案與回復步驟。Hosting 回復優先使用 Firebase Hosting release 歷史的 rollback，不需自行保存 build artifact，但必須先滿足前提：release 歷史存在不代表舊版本內容仍可回復（可能因版本保留數量設定或人工刪除而消失，見[官方說明](https://firebase.google.com/docs/hosting/manage-hosting-resources)）。發布前須：(1) 記錄目前 live 的 `SITE_ID` 與 `VERSION_ID`；(2) 在 Console 確認版本保留設定不會在回復窗口內清除該版本；(3) 回復時使用 Console 的 Rollback，或以指定版本 clone，避免 clone 到來源 channel 的最新版本：

```sh
firebase hosting:clone <SITE_ID>:@<VERSION_ID> <SITE_ID>:live
```

程式碼層面保留升級前 lockfile 與 worker 的 commit，發布失敗時一起回復，並確認瀏覽器實際載入舊 worker；僅回退 bundle 不足以證明推播已回復。Functions 未更動時不因前端升級重部署全部服務。

交付必含：依賴版本與 peers 證據、變更檔案、各 gate 結果、尚未執行項目、手動測試紀錄。未執行 FCM 或評鑑整合測試時，標示未驗證，不宣稱升級已可發布。

## 2026-11-07 核准範圍補充

使用者核准在本分支一併修正評鑑未指派寫入問題，核對表單與既有指派的評核者／受評者／週期一致性。此項為原「不變更 Rules 語意」範圍的明確例外。驗證與部署注意事項見 [實作驗證紀錄](2026-11-07-angularfire-21-validation.md)。
