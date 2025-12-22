# 變更日誌

本專案的所有重要變更都將記錄在此檔案中。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
並且本專案遵循 [語義化版本](https://semver.org/lang/zh-TW/)。

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

[2.0.0]: https://github.com/NOAHXDM/NGEip/compare/6317ec7...HEAD
[1.0.0]: https://github.com/NOAHXDM/NGEip/releases/tag/v1.0.0
