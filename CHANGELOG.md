# 變更日誌

本專案的所有重要變更都將記錄在此檔案中。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
並且本專案遵循 [語義化版本](https://semver.org/lang/zh-TW/)。

## [3.0.7] - 2026-03-24

### 修復
- 修正健檢補助進度條在終身累計制下顯示錯誤的問題：
  - 舊邏輯：進度條使用 `usedAmount / totalLimit`，但終身累計制下 `usedAmount + availableAmount ≠ totalLimit`，導致百分比與實際可用額度不一致
  - 新邏輯：健檢補助進度條改為 `usedAmount / (usedAmount + availableAmount)`，正確反映已使用與剩餘可用的比例
  - 「總額」標籤改為「上限：12,000」，避免語義混淆
- 健檢補助獨立為專屬顯示區塊（`subsidy.type === 2`），與其他補助的進度條計算邏輯分離

## [3.0.6] - 2026-03-24

### 變更
- 健檢補助（Health Check）額度計算邏輯從「年度 carry-over 制」改為「年資累進終身累計制」：
  - 舊邏輯：年度固定額度 6,000，前一年未用完的餘額可結轉至當年，最多累積 12,000
  - 新邏輯：從到職日起算，每滿一年增加 6,000 可用額度，剩餘可用額度上限為 12,000
  - 已使用金額改為查詢歷年所有已核准的健檢補助總額（終身累計），不再僅計算當期
  - 年資計算改用 `differenceInYears`（基於日曆日期），取代原本的 `differenceInDays / 365.25`
- 移除健檢補助的前一年統計查詢（`previousYearStats$`），改為全時間查詢，減少 Firestore 讀取次數

### 範例
- 到職日 2024-03-24：
  - 2025-03-24 滿 1 年 → 額度 6,000
  - 2025-05-01 申請 5,000 → 剩餘 1,000
  - 2026-03-24 滿 2 年 → 累計額度 12,000，已用 5,000，剩餘 7,000
  - 2027-03-24 滿 3 年 → 累計額度 18,000，已用 5,000，剩餘 min(13,000, 12,000) = 12,000

## [3.0.5] - 2026-03-20

### 文件
- 同步規格文件與程式碼邏輯，修正 6 處衝突：JSDoc `validEvaluatorCount` 門檻（< 3 → < 5, FR-015）、新增 `getSnapshotsByUserId` 介面、新增 `UserAttributeReportEmbedComponent` 契約、Firestore 寫入成本（3 → 4 writes）、`plan.md` 補充 rawAttributes/rawTotalScore 更新說明與元件結構（5 → 6 components）

## [3.0.4] - 2026-03-19

### 修復
- 修正跑馬燈評語元件（`MarqueeCommentsComponent`）滾動速率異常問題：將 `marquee-track` 的 `display: flex` 改為 `display: inline-flex`，使元素寬度由文字內容撐開，恢復恆定 120px/s 滾動速率
- 修正評核人數不足警示門檻（FR-015）：`attribute-report` 與 `user-attribute-report-embed` 兩個元件由 `validEvaluatorCount < 3` 改為 `< 5`，與功能規格一致
- 優化補助類型（subsidy type）標籤中文顯示文字，提升可讀性

### 文件
- 更新 README.md 評量考核系統說明文件
- 同步規格文件衝突修正：`tasks.md` 索引描述（userId+cycleId DESC → userId+computedAt DESC）、`angular-interfaces.md` 跑馬燈契約更新、`plan.md` 跑馬燈設計章節更新

## [3.0.3] - 2026-03-18

### 新增
- 評核題目新增行為觀察 hint 說明，協助評核者理解各題目的觀察重點

### 修復
- 修正評核者提交表單時 `userAttributeSnapshots` preview 快照缺少 `computedAt` 欄位，導致 `getMySnapshots()` 回傳空陣列的問題

### 變更
- 移除評鑑屬性報告頁面與嵌入式元件中的 ⚠️ 警告符號，簡化預覽狀態通知的視覺表達

## [3.0.2] - 2026-03-18

### 新增
- 指派管理視窗排除已離職使用者；使用者清單欄位標頭中文化

### 修復
- 修正考評表單評語字數驗證邏輯，與 Firestore Security Rules 保持一致

## [3.0.1] - 2026-03-17

### 修復
- 修正考評表單提交時 `feedbacks` 欄位含 `undefined` 值導致 Firestore SDK 拋出 TypeError 的問題
- 修正自我評核情境下 Firestore Security Rules 拒絕 batch 寫入的問題；service 層加入提前偵測並拋出明確錯誤訊息
- 修復評核總覽管理員頁面（`/evaluation/admin/overview`）`attributes` / `totalScore` 為 `undefined` 時呼叫 `.toFixed()` 導致渲染崩潰的問題
- 更新 Firestore Security Rules：允許一般使用者在 batch 寫入中遞增 `completedAssignments`；`userAttributeSnapshots` create rule 補上 `status:preview` 驗證

### 變更
- 導覽列調整：「使用者」按鈕移至桌面版常駐區，所有人均可存取，管理員專屬選單移除重複項目
- 加班優先順序設定區塊標題文字修正

## [3.0.0] - 2026-03-17

### 新增
- 實作同儕互評模組（#002）：支援員工間互相評核，包含問卷填寫、評分彙整與報表檢視
- 使用者個人檔案新增「屬性報告」（Attribute Report）Tab，供管理員檢視員工互評職場屬性分析
- 管理員可從使用者卡片直接進入屬性報告頁面

### 變更
- 完整國際化（i18n）至繁體中文，修復相關 build 問題
- 重整導航選單結構，新增手機版響應式顯示支援
- 考核週期排序改為依 `computedAt` 倒序排列，最新結果優先顯示

### 修復
- 修正評核表單問卷屬性對應關係
- 修正 my-report 頁面 `totalScore` 與 `attributes` 欄位 undefined 導致 `toFixed` 崩潰的問題

### 內部
- 建立同儕互評系統完整規格（spec.md）與實作計畫（plan.md）
- 移除補助申請原始資料與資料移轉工具（已完成遷移）

## [2.2.4] - 2026-03-10

### 修復
- 修復出勤統計頁面選擇尚未結算的月份時，顯示空白資料的問題（#11）
- 未結算月份現在改為動態計算該月已核准（Approved）的出勤時數，行為與 CURRENT 模式相同
- 統計頁面在無結算資料時（含 CURRENT）改顯示「Statistics not yet settled」提示，取代原本空白狀態

### 技術改進
- `AttendanceStatsService` 新增 `getAttendanceStatsTemporaryForMonth(yearMonth)` 公開方法，支援針對指定月份動態計算統計
- `AttendanceStatsComponent` 非 CURRENT 選項改用 `switchMap`，Firestore 無結算資料時自動 fallback 動態計算

## [2.2.3] - 2026-01-27

### 新增
- 午餐補助日報表新增「Import without limit」按鈕，支援匯入原始金額而不受 $150 限制
- 餐費匯入功能現在可選擇是否套用金額上限

### 變更
- 優化餐費匯入介面，提供兩種匯入模式：
  - Import：套用 $150 上限（原有功能）
  - Import without limit：不套用上限，直接匯入表格原始金額

## [2.2.2] - 2026-01-16

### 變更
- 移除補助申請遷移腳本中的冗餘欄位 `installmentCount` 和 `totalMonthlyAmount`
- 更新遷移文件說明，移除已廢棄的欄位引用
- 補助統計資訊現在完全從 `installments` 子集合動態計算，避免資料不一致

### 技術改進
- 簡化 `subsidyApplications` 文件結構，減少資料冗餘
- 統一資料來源：分期數和總金額統一從 `installments` 子集合計算

## [2.2.1] - 2025-12-28

### 重構
- 升級至 Angular 20 控制流語法
- 將 user-profile 元件的 `*ngIf` 改為 `@if` 語法
- 移除未使用的 NgIf 匯入
- 消除 NG8113 編譯警告

## [2.2.0] - 2025-12-28

### 新增
- 使用者個人檔案新增「補助額度」（Subsidy Limit）Tab，顯示員工補助使用情況
- 基於到職日週年計算補助額度（例如：到職日 2024/3/15，期間為 2024/3/15 - 2025/3/14）
- 補助申請資格自動判斷：
  - 試用期（90 天）檢查
  - 滿一年檢查
  - 額度用完自動標記為不可申請
- 五種補助類型完整支援：
  - 進修課程補助（Training）：試用期後可申請，年度上限 24,000
  - AI 工具補助（AI Tool）：試用期後可申請，年度上限 10,000
  - 健檢補助（Health Check）：滿一年可申請，年度上限 6,000，可累積最多 12,000
  - 筆電補助（Laptop）：滿一年可申請，年度上限 54,000
  - 旅遊補助（Travel）：滿一年可申請，年度上限 15,000
- 筆電補助特殊處理：
  - 顯示分期領取進度（已領取 X/36 期）
  - 前一次筆電補助必須領完 36 期才能再次申請
  - 顯示已領取金額與核准金額
- 健檢補助累積邏輯：前一年未用完的額度可累積至當年，最多累積至 12,000
- 進修+AI 工具聯合限制：兩者合計上限 24,000，AI 工具獨立上限 10,000
- 補助額度 Tab 內容可垂直捲動，期間資訊固定在頂部（sticky）

### 變更
- User Profile Dialog 新增高度限制（maxHeight: 90vh），解決內容過長無法捲動的問題
- 補助額度 Tab 所有介面文字改為英文，提升國際化支援
- 補助額度檢查邏輯：額度用完或超過時自動顯示「Quota exceeded」

### 技術改進
- 新增 `SubsidyLimitService` 服務，封裝補助額度計算邏輯
- 實作到職日週年期間計算功能
- 實作筆電分期狀態查詢功能
- 優化補助額度 UI/UX，包含進度條視覺化和資格狀態標籤

## [2.1.0] - 2025-12-27

### 新增
- 出勤服務新增 `actionBy` 參數，用於記錄建立與更新操作的執行者

### 變更
- 升級 Angular 框架至 v20 版本
- 重構補助統計排行榜，改為 Dialog 彈窗展示方式
- 調整午餐補助匯入邏輯以適應新版 Excel 格式

### 修復
- 修復 Angular v20 升級後的相容性問題

## [2.0.0] - 2025-12-23

### 新增

#### 補助管理系統
- 員工補助申請系統（第一階段與第二階段）
- 餐費補助系統（第三階段）
- 多種補助類型支援（培訓課程、筆電、餐費等）
- 補助申請審批工作流程
- 筆電分期記錄管理，支援自訂金額輸入
- 全面的補助統計功能（使用者級別與系統級別分析）
- Google Sheets 匯入功能，用於餐費補助記錄
- 補助資料遷移工具（支援開發與正式環境）
- Firestore 索引優化，提升補助申請與使用者餐費統計查詢效能

#### 開發者工具與文件
- 新增 `CLAUDE.md` 為 Claude Code 提供專案指引
- 新增 GitHub Actions 工作流程：
  - Claude PR Assistant workflow
  - Claude Code Review workflow

### 變更
- 更新補助申請計畫，移除過時的系統配置章節
- 更新補助申請詳細資訊，反映培訓課程 50% 資助政策
- 更新補助申請計畫，使用修訂版 Excel 檔案

### 改進
- 在使用者列表中隱藏已離職員工的聯絡資訊和生日
- 基於實際分期金額實作筆電補助統計
- 重構程式碼結構以提高可讀性和可維護性

### 修復
- 更新 `firebase.local.json` 中的託管來源路徑

### 移除
- 移除過時的補助申請 Excel 檔案

## [1.0.0] - 2024-12-15

### 新增

#### 使用者管理
- 使用者註冊與認證功能
- 基於角色的存取控制（管理員/一般使用者）
- 使用者個人資料管理
- 使用者列表顯示與篩選
- Cloudinary 整合用於頭像上傳
- 支援 Google 帳戶登入
- 離職員工視覺化指示器（LineThroughDirective）

#### 出勤管理
- 出勤記錄建立與追蹤
- 狀態管理（待審核/已核准/已拒絕）
- 多種出勤類型支援
- 出勤統計與報表功能
- 基於日期的動態篩選（每日、每週、每月、自訂範圍）
- 申請人篩選對話框
- 出勤歷史記錄與稽核軌跡
- 出勤統計匯出為 CSV 格式
- Firestore 索引優化，提升出勤查詢效能

#### 特休管理
- 基於服務年資計算特休假
- 特休餘額追蹤
- 特休交易歷史記錄
- 特休結算功能
- 可配置的請假政策（台灣勞基法）

#### 系統配置
- 授權管理（最大使用者數與當前使用者數）
- 請假政策配置
- 系統偏好設定（初始結算年度、加班優先順序）
- Cloudinary 配置（cloud name、upload preset）
- 時區選擇與處理
- 自訂日期範圍選項

#### Firebase 整合
- Firebase Authentication 整合
- Firestore 資料庫整合
- Firebase Hosting 部署
- Firebase 模擬器支援（本地開發）
- 環境特定配置（本地與正式環境）
- Firestore 安全規則（基於角色的權限控制）

#### 使用者介面
- 響應式設計（Angular Material + Bootstrap 5）
- 深色模式支援
- 工具列導航與使用者選單
- 卡片式佈局顯示使用者資訊
- 浮動操作按鈕
- 客製化 Snackbar 通知
- 日期時間選擇器整合
- 動態表格排序與篩選

### 變更
- 從 moment.js 遷移至 date-fns 進行日期處理
- 重構為 Angular 18 standalone components
- 簡化認證與 Firestore 模擬器設定

### 技術堆疊
- Angular 18
- Firebase (Auth, Firestore, Hosting)
- Angular Material
- Bootstrap 5
- date-fns
- Cloudinary
- Karma/Jasmine

[2.2.4]: https://github.com/NOAHXDM/NGEip/compare/v2.2.3...HEAD
[2.2.3]: https://github.com/NOAHXDM/NGEip/compare/v2.2.2...v2.2.3
[2.2.2]: https://github.com/NOAHXDM/NGEip/compare/v2.2.1...v2.2.2
[2.2.1]: https://github.com/NOAHXDM/NGEip/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/NOAHXDM/NGEip/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/NOAHXDM/NGEip/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/NOAHXDM/NGEip/compare/6317ec7...v2.0.0
[1.0.0]: https://github.com/NOAHXDM/NGEip/releases/tag/v1.0.0
