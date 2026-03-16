# NGEip Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-17

## Active Technologies

- (002-peer-evaluation) Angular 20 Standalone Components · Cloud Firestore (4 new collections) · Firebase JS SDK v10+ · RxJS · Pure SVG charts (no chart library) · Karma/Jasmine · Firebase Emulator (rules-unit-testing)

## Project Structure

```text
src/
├── app/
│   ├── evaluation/            # 評量考核系統功能模組 (002-peer-evaluation)
│   │   ├── models/            # TypeScript 介面 (EvaluationCycle, EvaluationForm, ...)
│   │   ├── services/          # Firestore 服務 + ZScoreCalculatorService
│   │   ├── components/        # 可重用 UI (RadarChart, TrendLineChart, MarqueeComments, ...)
│   │   └── pages/             # 頁面元件 (tasks, form, report, admin)
│   ├── services/              # 現有全域服務 (UserService, ...)
│   └── guards/                # authGuard, adminGuard
├── environments/
firestore.rules                # 需新增 4 個集合規則
firestore.indexes.json         # 需新增 6 個複合索引
```

## Commands

```bash
npm start          # 本地開發
npm test           # Karma 單元測試
firebase emulators:start --only auth,firestore   # 啟動 Emulator 用於整合測試
```

## Code Style

- 所有元件使用 `standalone: true`，以 `imports: []` 明確宣告依賴
- Service 以 `providedIn: 'root'` 為主，回傳 `Observable<T>` (RxJS)
- Firestore 操作使用 `collectionData()`, `docData()`, `setDoc()`, `updateDoc()`, `writeBatch()`
- 避免在 component 中直接呼叫 Firebase SDK，所有 Firestore 操作集中在 services
- 字串常數（集合名稱等）使用 `const` 或 `enum`，勿散落在程式碼中
- 繁體中文（zh-TW）用於所有使用者可見文字與 spec/plan 文件

## Recent Changes

- 002-peer-evaluation: 新增評量考核系統。Firestore 集合：`evaluationCycles`, `evaluationAssignments`, `evaluationForms`, `userAttributeSnapshots`。Z-score 防灌水校正（前端計算），純 SVG 雷達圖與趨勢圖，跑馬燈整體評價，RO 職業原型判定。

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

