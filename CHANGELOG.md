# 變更日誌

本專案的所有重要變更都將記錄在此檔案中。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
並且本專案遵循 [語義化版本](https://semver.org/lang/zh-TW/)。

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

[2.2.1]: https://github.com/NOAHXDM/NGEip/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/NOAHXDM/NGEip/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/NOAHXDM/NGEip/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/NOAHXDM/NGEip/compare/6317ec7...v2.0.0
[1.0.0]: https://github.com/NOAHXDM/NGEip/releases/tag/v1.0.0
