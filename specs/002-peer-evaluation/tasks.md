# 任務清單：評量考核系統

**分支**：`002-peer-evaluation` | **日期**：2026-03-17  
**輸入**：`specs/002-peer-evaluation/` 的 spec.md、plan.md、data-model.md、contracts/、research.md、quickstart.md

**測試要求**：Karma/Jasmine 單元測試（business logic）+ Firebase Emulator 整合測試（Security Rules 匿名性）為交付門檻（憲章要求）。

---

## 格式說明

- `[P]`：可與同層其他 [P] 任務平行執行（不同檔案、無相依）
- `[USn]`：任務所屬使用者故事（僅故事階段使用）
- 每項任務說明含精確檔案路徑

---

## Phase 1：準備（模組骨架）

**目的**：建立 evaluation 模組的完整目錄骨架、TypeScript 型別、路由與測試基礎設定，讓後續所有階段可平行展開。

- [X] T001 建立 `src/app/evaluation/` 目錄骨架（models/, services/, components/, pages/ 四個子目錄），建立空白 barrel exports（index.ts）
- [X] T002 [P] 依照 `contracts/angular-interfaces.md` 定義所有 TypeScript 介面、型別與常數於 `src/app/evaluation/models/evaluation.models.ts`（含 EvaluationCycle、EvaluationAssignment、EvaluationForm、UserAttributeSnapshot、AttributeScores、EvaluationFormDraft 等）
- [X] T003 [P] 建立 `src/app/evaluation/evaluation.routes.ts`（含 tasks、form、my-report、admin/cycles、admin/overview 五條路由），並將 evaluation lazy-load 路由整合至 `src/app/app.routes.ts`
- [X] T004 [P] 建立 Firebase Emulator 測試輔助設定於 `src/app/evaluation/testing/emulator-setup.ts`（initializeTestEnvironment、測試帳號工廠：admin、evaluator、evaluatee）

---

## Phase 2：基礎能力（阻塞性前置）

**目的**：完成所有使用者故事共同依賴的 Security Rules、Firestore 索引與核心計算服務；Phase 2 完成前，US1–US4 不得進入整合測試。

- [X] T005 更新 `firestore.rules`，新增 evaluationCycles（read: isSignedIn, write: isAdmin）、evaluationAssignments（read: evaluator 本人 or admin, create: admin, update: evaluator 本人 or admin, delete: admin）、evaluationForms（read: evaluator 本人 or admin, create: evaluator 本人 含分數範圍與字數驗證, update: admin only, delete: if false）、userAttributeSnapshots（read: 本人 or admin, create/update: admin or evaluator-preview 限制, delete: if false）的完整安全規則
- [X] T006 [P] 更新 `firestore.indexes.json`，新增依 `data-model.md` 定義的 6 個複合索引：evaluationAssignments(evaluatorUid+status)、(cycleId+evaluateeUid)、(evaluatorUid+cycleId)；evaluationForms(evaluatorUid+cycleId)、(cycleId+evaluateeUid)；userAttributeSnapshots(userId+cycleId DESC)、(cycleId+totalScore DESC)
- [X] T007 建立 Security Rules 整合測試於 `src/app/evaluation/testing/firestore-rules.spec.ts`，驗證 10 個關鍵案例（evaluatee 讀 evaluationForms → DENIED、評核者讀他人表單 → DENIED、Admin 讀任何集合 → ALLOWED、受評者讀自己 snapshot → ALLOWED、評核者試圖寫 final snapshot → DENIED、評核者更新自己 snapshot → DENIED 等）
- [X] T008 [P] 建立 ZScoreCalculatorService（純計算服務，無 Firestore 依賴）於 `src/app/evaluation/services/zscore-calculator.service.ts`，實作 per-rater Z-score 校正（TARGET_MEAN=5.5, SD=1.5, clamp 1–10）、六大屬性彙整（FR-009 公式）、determineArchetypes（勇者/初心者/8原型並列邏輯）、detectReciprocalHighScores、detectOutlierEvaluators
- [X] T009 [P] 建立 ZScoreCalculatorService 完整單元測試於 `src/app/evaluation/services/zscore-calculator.service.spec.ts`，覆蓋：sd=0 邊界（不校正）、多評核者 Z-score 結果正確、属性分數 clamp(1,10)、職業原型六種單一原型、勇者判定（全≥8）、初心者判定（三項<6 優先）、並列輸出多原型、互惠高分對偵測、離群評核者偵測

**Checkpoint**：T005–T009 完成後，US1–US4 可開始平行開發

---

## Phase 3：使用者故事 1 — 管理者發起考核週期與指派 (Priority: P1) 🎯 MVP

**目標**：管理者可建立考核週期、指派評核關係，並讓評核者在任務清單中看到待辦任務。
**獨立驗證方式**：建立週期並指派後，以評核者帳號登入確認任務出現；以受評者帳號確認看不到評核者身份。

### 測試

- [X] T010 [P] [US1] 建立 EvaluationCycleService 單元測試於 `src/app/evaluation/services/evaluation-cycle.service.spec.ts`，覆蓋：createCycle 寫入欄位正確、updateDeadline 更新 deadline、completedAssignments 遞增邏輯、closeAndPublish 前提驗證（status 必須為 active 或 expired_pending）
- [X] T011 [P] [US1] 建立 US1 Firebase Emulator 整合測試於 `src/app/evaluation/testing/us1-integration.spec.ts`：管理者建立週期 → evaluationCycles 文件存在；管理者指派後評核者 getMyAssignments() 回傳 1 筆；一般使用者建立週期 → DENIED；重複指派（相同 evaluatorUid + cycleId + evaluateeUid 鍵）→ 覆蓋而非重複（確定性鍵設計）

### 實作

- [X] T012 [P] [US1] 建立 EvaluationCycleService 於 `src/app/evaluation/services/evaluation-cycle.service.ts`，實作 getCycles()（orderBy createdAt DESC）、getCycleById()、createCycle()（寫入 totalAssignments/completedAssignments 初始值）、updateDeadline()、closeAndPublish()（stub，Phase 6 完整實作）
- [X] T013 [P] [US1] 建立 EvaluationAssignmentService 於 `src/app/evaluation/services/evaluation-assignment.service.ts`，實作 getMyAssignments()（where evaluatorUid + shareReplay(1)）、getAssignmentsByCycle()、createAssignments()（批次 setDoc 以確定性鍵防重複）、deleteAssignment()
- [X] T014 [US1] 建立 EvaluationCyclesAdminComponent 頁面於 `src/app/evaluation/pages/evaluation-cycles-admin/`（週期卡片清單含完成率、新增週期 Dialog 含年份/H1 H2/截止日欄位、截止日修改 inline 或 Dialog、「結束並發布」按鈕，截止日已過時顯示「已截止，待確認」標籤）
- [X] T015 [US1] 建立指派管理子頁面或 Dialog 於 `src/app/evaluation/pages/evaluation-cycles-admin/`（從使用者清單選擇受評者，為每位受評者選擇一到多位評核者，呈現已指派清單，支援刪除未提交的指派，截止日已過後禁用新增指派）

**Checkpoint**：US1 可獨立展示：管理者建立週期 + 指派 → 評核者看到待辦任務

---

## Phase 4：使用者故事 2 — 評核者填寫匿名考評表 (Priority: P1)

**目標**：評核者可在任務清單中查看任務、進入考評表填寫 10 道題、整體評價，並提交（原子性 batch 操作）。
**獨立驗證方式**：提交表單後確認 (1) 任務移至「已填寫」(2) snapshot preview 更新 (3) 受評者頁面無法識別提交者。

### 測試

- [X] T016 [P] [US2] 建立 EvaluationFormService 單元測試於 `src/app/evaluation/services/evaluation-form.service.spec.ts`，覆蓋：整體評價 <20 字阻止提交、>500 字阻止提交、分數 ≥9 未填說明 → 驗證失敗、分數 ≤3 未填說明 → 驗證失敗、已提交表單重複提交阻止（assignment.status === 'completed' 判斷）
- [X] T017 [P] [US2] 建立 US2 Firebase Emulator 整合測試於 `src/app/evaluation/testing/us2-integration.spec.ts`：提交表單後 batch 寫入驗證（evaluationForms 存在、snapshot overallComments arrayUnion、assignment status=completed）；受評者讀 evaluationForms → DENIED；截止日後提交 → 前端守衛阻止（模擬 deadline 已過情境）

### 實作

- [X] T018 [P] [US2] 建立 EvaluationFormService 於 `src/app/evaluation/services/evaluation-form.service.ts`，實作 submitForm()（Firestore batch：寫入 evaluationForms、arrayUnion overallComment + 更新 preview 屬性分數至 snapshot、assignment status→completed + completedAt、cycle completedAssignments +1）、getMyForm()、getAllFormsByCycle()、getFormsByEvaluatee()
- [X] T019 [P] [US2] 建立 EvaluationTasksComponent 於 `src/app/evaluation/pages/evaluation-tasks/`（「待填寫」/「已填寫」分頁，顯示受評者姓名與截止日，截止日已過顯示「考核截止日期已過」提示，已提交顯示唯讀標籤）
- [X] T020 [US2] 建立 EvaluationFormComponent 於 `src/app/evaluation/pages/evaluation-form/`（完整表單：10 題評分器含行為說明、各題選填回饋（分數 ≥9 或 ≤3 自動轉必填）、表單末尾整體評價必填欄含即時字數計數器、「已提交」唯讀視圖模式、截止日已過拒絕填寫提示）
- [X] T021 [P] [US2] 建立 EvaluationFormQuestionsComponent 於 `src/app/evaluation/components/evaluation-form-questions/`（10 道固定題目重用片段：題目文字、1–10 評分器 with 分數行為說明 tooltip、選填/必填文字回饋欄）

**Checkpoint**：US2 可獨立展示：填寫並提交考評表 → 任務移至已填寫 → 受評者看不到評核者身份

---

## Phase 5：使用者故事 3 — 受評者查看個人職場屬性報告 (Priority: P2)

**目標**：受評者可看到六角雷達圖（含及格線警示）、職業原型標籤、跑馬燈整體評價、跨週期成長折線圖，且完全無法識別評核者身份。
**獨立驗證方式**：多位評核者提交後，受評者屬性圖顯示正確分數、職業原型符合算法規則；切換歷史週期圖表動態更新；無評核者身份資訊可見。

### 測試

- [X] T022 [P] [US3] 建立 RadarChartComponent 單元測試於 `src/app/evaluation/components/radar-chart/radar-chart.component.spec.ts`，覆蓋：6 軸幾何座標計算正確（每軸 60°，從 12 點鐘順時針）、分數低於 6 時 warning class 套用、空 axes 不崩潰、maxValue 邊界
- [X] T023 [P] [US3] 建立 US3 Firebase Emulator 整合測試於 `src/app/evaluation/testing/us3-integration.spec.ts`：受評者讀自己 userAttributeSnapshot → ALLOWED（含 overallComments 陣列）；讀他人 snapshot → DENIED；snapshot 切換週期資料一致性；snapshot overallComments 不含任何 evaluatorUid

### 實作

- [X] T024 [P] [US3] 建立 UserAttributeSnapshotService 於 `src/app/evaluation/services/user-attribute-snapshot.service.ts`，實作 getMySnapshots()（where userId==uid, orderBy cycleId DESC, shareReplay(1)）、getMySnapshot(cycleId)、getAllSnapshotsByCycle(cycleId)
- [X] T025 [P] [US3] 建立 RadarChartComponent 於 `src/app/evaluation/components/radar-chart/`（純 SVG 六角雷達圖：5 層背景六角 2/4/6/8/10、6 條軸線、橘色虛線及格線（6/10）、半透明藍資料六角、低於及格線頂點紅色警示點、軸標籤含屬性代號+分數小數兩位）
- [X] T026 [P] [US3] 建立 TrendLineChartComponent 於 `src/app/evaluation/components/trend-line-chart/`（純 SVG 趨勢折線圖：X 軸週期名稱、Y 軸 0–10 刻度、6 色折線各代表一屬性、選中週期以垂直虛線高亮）
- [X] T027 [P] [US3] 建立 MarqueeCommentsComponent 於 `src/app/evaluation/components/marquee-comments/`（CSS @keyframes translateX 跑馬燈、空陣列時 @if 不渲染、速度依文字總長度動態計算、輪播時不顯示評核者識別資訊）
- [X] T028 [P] [US3] 建立 CareerArchetypeBadgeComponent 於 `src/app/evaluation/components/career-archetype-badge/`（接受 archetypes: string[] 輸入，並列時以 / 分隔顯示多個原型，RO 職業表情符號+中文名稱）
- [X] T029 [US3] 建立 AttributeReportComponent 於 `src/app/evaluation/pages/attribute-report/`（整合：頂部 MarqueeCommentsComponent、週期選擇器 MatSelect（切換後跑馬燈同步切換）、FR-015 評核人數不足警示、基本資訊卡（職業原型 CareerArchetypeBadgeComponent、總分、validEvaluatorCount）、RadarChartComponent（分數小數兩位）、FR-017 職等及格行為標準說明區塊（依 jobRank 顯示 J/M/S 說明，不符時顯示「職等未設定」）、TrendLineChartComponent 歷史折線圖、「最終結果尚未發布」banner（status===preview 時）、「本期尚無考評資料」空狀態引導）

**Checkpoint**：US3 可獨立展示：查看屬性報告 → 雷達圖/折線圖/職業原型/跑馬燈全部正確顯示，且無評核者身份資訊

---

## Phase 6：使用者故事 4 — 管理者總覽與查閱考評表 (Priority: P2)

**目標**：管理者可查看週期完成率、查閱所有考評表（含評核者身份）、執行「結束並發布」（觸發 Z-score 批次計算）、開啟選擇性排名視圖。
**獨立驗證方式**：管理者結束並發布後確認 snapshot 狀態改為 final、Z-score 校正分數正確；排名視圖以總分排序並顯示名次；一般使用者無法存取管理頁面。

### 測試

- [X] T030 [P] [US4] 建立 closeAndPublish 流程單元測試於 `src/app/evaluation/services/evaluation-cycle.service.spec.ts`（補充 Phase 3 T010），覆蓋：連同 ZScoreCalculatorService mock 驗證 batch 寫入正確快照（status→final、校正後 totalScore）、anomalyFlags 正確更新、cycle status→closed、逾期 assignment status→overdue
- [X] T031 [P] [US4] 建立 US4 Firebase Emulator 整合測試於 `src/app/evaluation/testing/us4-integration.spec.ts`：管理者執行 closeAndPublish 後 userAttributeSnapshots status===final 且 rankingScore 已填；非管理者存取 GET /admin/overview 路由 → canActivate 返回 false；管理者排名查詢（cycleId + totalScore DESC 索引）回傳正確排序

### 實作

- [X] T032 [US4] 完整實作 EvaluationCycleService.closeAndPublish() 於 `src/app/evaluation/services/evaluation-cycle.service.ts`（呼叫 EvaluationFormService.getAllFormsByCycle → ZScoreCalculatorService.compute → Firestore batch：每位受評者 snapshot status→final + 校正屬性 + careerArchetypes + rankingScore、有異常表單更新 anomalyFlags、逾期 assignment status→overdue、cycle status→closed + closedAt）
- [X] T033 [P] [US4] 建立 EvaluationOverviewAdminComponent 於 `src/app/evaluation/pages/evaluation-overview-admin/`（週期選擇下拉、完成率進度條（completedAssignments/totalAssignments）、受評者卡片清單（預設不排名，顯示屬性分數、職業原型、評核人數、異常標記 icon）、「開啟排名視圖」toggle（選擇排序欄位：totalScore/EXE/INS/ADP/COL/STB/INN，升降冪，顯示名次數字）、可點擊受評者卡片展開該周期所有考評表明細（含評核者姓名、各題分數、整體評價）、防灌水標記說明 tooltip）

**Checkpoint**：US4 可獨立展示：管理者結束並發布 → 快照更新 → 排名視圖正確；一般使用者拒絕存取

---

## Phase 7：收尾（跨切面關注）

**目的**：確保導覽可用、角色守衛完整、空狀態友善，以及文件更新。

- [X] T034 [P] 確認或建立 adminGuard 於 `src/app/guards/admin.guard.ts`，限制 evaluation/admin/* 路由僅管理者（role === 'admin'）可進入，非管理者重導至首頁並顯示「權限不足」提示
- [X] T035 [P] 更新導覽選單於 `src/app/layout/layout.component.html`，新增「評量考核」頂層入口（所有已登入使用者可見，包含：我的考評任務、我的屬性報告；管理者額外顯示：週期管理、考評總覽）
- [X] T036 [P] 加入所有空狀態引導文字：EvaluationCyclesAdminComponent（無週期時）、EvaluationTasksComponent（無任務時）、AttributeReportComponent（無歷史資料時：「尚無考核歷史資料，您的屬性報告將在第一次考核結束後顯示。」）
- [X] T037 更新 `README.md` 新增「評量考核系統」功能說明章節（操作流程、角色說明、RO 屬性圖特色、匿名性保障說明）
- [X] T038 [P] 執行 `npm run build` 驗證全專案 TypeScript 無編譯錯誤；執行 `npm test` 確認所有新增單元測試通過

---

## 相依性圖（使用者故事完成順序）

```
Phase 1（Setup）
    ↓
Phase 2（Security Rules + Indexes + ZScoreCalculatorService）
    ↓ ↓ ↓ ↓
   US1  US2   ← 可平行開發（P1，阻塞所有使用者接觸功能的起點）
    ↓    ↓
   US3  US4   ← 依賴 US1+US2 的資料；元件開發可提前開始但整合測試需 US1+US2
        ↓
     Polish
```

**使用者故事間依賴說明**：
- US3（受評者屬性報告）依賴 US2 的考評表提交產生 userAttributeSnapshots 資料；元件本身可提前開發與測試
- US4（管理者結束並發布）依賴 US2 表單資料才能執行 Z-score；排名視圖依賴 US1 的週期管理完成

---

## 平行執行範例

### 使用者故事 3（US3）可平行示例

Phase 5 中以下任務可同步執行（不同檔案）：
```
T022（RadarChartComponent spec）    T023（US3 Emulator 整合測試）
T024（UserAttributeSnapshotService）T025（RadarChartComponent SVG）
T026（TrendLineChartComponent）     T027（MarqueeCommentsComponent）
T028（CareerArchetypeBadgeComponent）
    ↓ 全部完成後
T029（AttributeReportComponent 整合所有子元件）
```

### 使用者故事 1 + 2 可同步進行（Phase 3 + Phase 4 平行）
```
Phase 3: T010, T011（測試）→ T012, T013（Service）→ T014 → T015（Admin頁面）
Phase 4: T016, T017（測試）→ T018, T019（Service）→ T020 → T021（評核頁面）
```

---

## 實作策略（MVP 優先）

### MVP 範圍（US1 + US2 完成即可展示核心價值）
完成 Phase 1–4（T001–T021 = 21 個任務）即可展示：
- 管理者建立週期與指派
- 評核者填寫匿名表單並提交
- 匿名性強制（Security Rules 層）

### 增量交付計畫

| 里程碑 | 包含任務 | 可展示功能 |
|-------|---------|-----------|
| MVP | T001–T021 | 週期建立、指派、填表提交、匿名保證 |
| M2 | T022–T029 | 受評者屬性報告（雷達圖、跑馬燈、職業原型、趨勢圖） |
| M3 | T030–T033 | 管理者結束並發布（Z-score）、總覽、排名視圖 |
| M4 | T034–T038 | 收尾：導覽、空狀態、文件、Build 驗證 |

---

## 每個使用者故事的獨立測試標準

| 使用者故事 | 獨立可驗證標準 |
|-----------|-------------|
| US1 | 管理者建立週期 → evaluationCycles 寫入；指派後評核者 getMyAssignments 回傳任務；重複指派不重複（確定性鍵）；一般使用者建立週期 DENIED |
| US2 | 提交表單 → batch 寫入 3 份文件；受評者讀表單 DENIED（匿名性）；字數 <20 阻止；截止日後阻止提交 |
| US3 | 受評者讀自己 snapshot ALLOWED；讀他人 DENIED；六角圖幾何正確；職業原型算法正確；跑馬燈切換週期正確 |
| US4 | closeAndPublish → snapshot status=final + Z-score 正確；排名排序正確；非管理者 DENIED |

---

## 格式驗證

確認所有任務遵循格式：
- ✅ 每項以 `- [ ]` 開頭
- ✅ 每項包含 Task ID（T001–T038）
- ✅ [P] 標記僅用於可平行任務
- ✅ [USn] 標記用於所有使用者故事 Phase 任務（Phase 3–6）
- ✅ Setup、Foundational、Polish Phase 無 Story 標記
- ✅ 每項包含精確檔案路徑
