import { inject, Injectable } from '@angular/core';
import {
  collection,
  collectionData,
  doc,
  Firestore,
  getDocs,
  query,
  Timestamp,
  where,
} from '@angular/fire/firestore';
import { differenceInDays, differenceInYears, addYears, startOfDay, isBefore } from 'date-fns';
import { combineLatest, forkJoin, from, map, Observable, of, switchMap } from 'rxjs';
import { SubsidyStatsService } from './subsidy-stats.service';
import { SubsidyApplication, SubsidyType } from './subsidy.service';

@Injectable({
  providedIn: 'root',
})
export class SubsidyLimitService {
  private readonly subsidyStatsService = inject(SubsidyStatsService);
  private readonly firestore = inject(Firestore);

  /**
   * 補助限額配置
   */
  private readonly subsidyLimits: Record<SubsidyType, SubsidyLimitConfig> = {
    [SubsidyType.Training]: {
      annualLimit: 24000,
      requiresFullYear: false,
      requiresProbationEnd: true,
      canCarryOver: false,
      displayName: 'Training',
    },
    [SubsidyType.AITool]: {
      annualLimit: 10000,
      requiresFullYear: false,
      requiresProbationEnd: true,
      canCarryOver: false,
      displayName: 'AI Tool',
    },
    [SubsidyType.HealthCheck]: {
      annualLimit: 6000,
      requiresFullYear: true,
      requiresProbationEnd: false,
      canCarryOver: false,
      yearlyIncrement: 6000,
      maxAvailable: 12000,
      lifetimeCumulative: true,
      displayName: 'Health Check',
    },
    [SubsidyType.Laptop]: {
      annualLimit: 54000,
      requiresFullYear: true,
      requiresProbationEnd: false,
      canCarryOver: false,
      displayName: 'Laptop',
    },
    [SubsidyType.Travel]: {
      annualLimit: 15000,
      requiresFullYear: true,
      requiresProbationEnd: false,
      canCarryOver: false,
      displayName: 'Travel',
    },
  };

  /**
   * 計算使用者到職日週年期間
   * @param startDate 到職日
   * @returns { periodStart, periodEnd, isCurrentPeriod, fiscalYear }
   */
  calculateAnniversaryPeriod(startDate: Date): AnniversaryPeriod {
    const today = new Date();
    const currentYear = today.getFullYear();

    // 計算最近的到職日週年期間
    let periodStart = new Date(
      currentYear,
      startDate.getMonth(),
      startDate.getDate()
    );

    // 如果今天在到職日之前，則週年期間是去年的到職日到今年的到職日前一天
    if (isBefore(today, periodStart)) {
      periodStart = new Date(
        currentYear - 1,
        startDate.getMonth(),
        startDate.getDate()
      );
    }

    const periodEnd = addYears(periodStart, 1);
    const isCurrentPeriod = isBefore(today, periodEnd);

    return {
      periodStart,
      periodEnd,
      isCurrentPeriod,
      fiscalYear: periodStart.getFullYear(),
    };
  }

  /**
   * 計算年資（以年為單位）
   */
  calculateYearsOfService(
    startDate: Date,
    targetDate: Date = new Date()
  ): number {
    const totalDays = differenceInDays(targetDate, startDate);
    return +(totalDays / 365.25).toFixed(2);
  }

  /**
   * 判斷是否通過試用期（假設試用期 3 個月 = 90 天）
   */
  isProbationPassed(
    startDate: Date,
    targetDate: Date = new Date()
  ): boolean {
    const daysSinceStart = differenceInDays(targetDate, startDate);
    return daysSinceStart >= 90;
  }

  /**
   * 判斷是否滿一年
   */
  isOneYearCompleted(
    startDate: Date,
    targetDate: Date = new Date()
  ): boolean {
    return this.calculateYearsOfService(startDate, targetDate) >= 1;
  }

  /**
   * 計算完整年數（基於日曆日期，用於健檢補助等年資累進計算）
   * 例如：2024-03-24 到 2026-03-23 = 1 年，2026-03-24 = 2 年
   */
  calculateCompletedYears(
    startDate: Date,
    targetDate: Date = new Date()
  ): number {
    return differenceInYears(targetDate, startDate);
  }

  /**
   * 取得使用者筆電補助的領取狀態
   * 查詢所有已核准的筆電補助申請及其 installments
   */
  getUserLaptopInstallmentStatus(userId: string): Observable<LaptopInstallmentStatus> {
    // 查詢所有已核准的筆電補助申請
    const applicationsRef = collection(this.firestore, 'subsidyApplications');
    const q = query(
      applicationsRef,
      where('userId', '==', userId),
      where('type', '==', SubsidyType.Laptop),
      where('status', '==', 'approved')
    );

    return from(getDocs(q)).pipe(
      switchMap((snapshot) => {
        const applications = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as SubsidyApplication[];

        if (applications.length === 0) {
          return of({
            totalReceivedAmount: 0,
            totalReceivedCount: 0,
            hasOngoingApplication: false,
            ongoingApplicationInfo: null,
          });
        }

        // 對每個申請查詢其 installments
        const installmentQueries = applications.map((app) => {
          const installmentsRef = collection(
            doc(this.firestore, 'subsidyApplications', app.id!),
            'installments'
          );
          return from(getDocs(installmentsRef)).pipe(
            map((installmentSnapshot) => {
              const installments = installmentSnapshot.docs.map((d) => d.data());
              const receivedCount = installments.length;
              const receivedAmount = installments.reduce(
                (sum, inst) => sum + (inst['amount'] || 0),
                0
              );

              return {
                application: app,
                receivedCount,
                receivedAmount,
                isComplete: receivedCount >= 36,
              };
            })
          );
        });

        return forkJoin(installmentQueries).pipe(
          map((results) => {
            const totalReceivedAmount = results.reduce(
              (sum, r) => sum + r.receivedAmount,
              0
            );
            const totalReceivedCount = results.reduce(
              (sum, r) => sum + r.receivedCount,
              0
            );

            // 查找是否有未完成的申請（已領取 < 36 期）
            const ongoingApplication = results.find((r) => !r.isComplete);

            return {
              totalReceivedAmount,
              totalReceivedCount,
              hasOngoingApplication: !!ongoingApplication,
              ongoingApplicationInfo: ongoingApplication
                ? {
                    receivedCount: ongoingApplication.receivedCount,
                    receivedAmount: ongoingApplication.receivedAmount,
                    approvedAmount: ongoingApplication.application.approvedAmount || 0,
                  }
                : null,
            };
          })
        );
      })
    );
  }

  /**
   * 取得使用者的補助使用情況
   * - 一般補助：以到職日週年期間（startDate ~ 滿週年）計算年度額度
   * - Training + AITool 聯合上限：Training 24,000（含 AITool），AITool 獨立上限 10,000
   *   Training 使用量超過 14,000 時會擠壓 AITool 可用額度
   * - 健檢補助：終身累計制，每滿一年增加 6,000，剩餘可用上限 12,000
   */
  getUserSubsidyLimitStatus(
    userId: string,
    startDate: Timestamp
  ): Observable<UserSubsidyLimitStatus> {
    const startDateObj = startDate.toDate();
    const period = this.calculateAnniversaryPeriod(startDateObj);
    const yearsOfService = this.calculateYearsOfService(startDateObj);
    const probationPassed = this.isProbationPassed(startDateObj);
    const oneYearCompleted = this.isOneYearCompleted(startDateObj);

    // 查詢當前週年期間的補助統計（使用到職日週年日期範圍）
    const currentPeriodStats$ = this.subsidyStatsService.getUserAllSubsidyStats(
      userId,
      undefined,
      { start: period.periodStart, end: period.periodEnd }
    );

    // 健檢補助：查詢歷年所有已核准的使用量（終身累計制）
    const lifetimeHealthCheckStats$ =
      this.subsidyStatsService.getUserSubsidyStatsByType(
        userId,
        SubsidyType.HealthCheck
      );

    // 筆電補助需要查詢所有時間的領取狀態
    const laptopStatus$ = this.getUserLaptopInstallmentStatus(userId);

    return combineLatest([currentPeriodStats$, lifetimeHealthCheckStats$, laptopStatus$]).pipe(
      map(([currentStats, lifetimeHealthCheck, laptopStatus]) => {
        const subsidies: SubsidyLimitDetail[] = [];

        // 處理每種補助類型
        Object.values(SubsidyType).forEach((type) => {
          if (typeof type === 'number') {
            const config = this.subsidyLimits[type];
            const currentTypeStats = currentStats.byType.find(
              (s) => s.type === type
            );
            const usedAmount = currentTypeStats?.totalAmount || 0;

            // 計算可用額度
            let availableAmount = config.annualLimit;
            let totalLimit = config.annualLimit;
            let laptopInstallmentInfo: LaptopInstallmentInfo | undefined;

            // 筆電補助：特殊處理
            if (type === SubsidyType.Laptop) {
              // 使用已領取的總金額作為「已使用」
              const laptopUsedAmount = laptopStatus.totalReceivedAmount;

              // 筆電補助不顯示可用/總額度，改為顯示領取進度
              if (laptopStatus.ongoingApplicationInfo) {
                laptopInstallmentInfo = {
                  receivedCount: laptopStatus.ongoingApplicationInfo.receivedCount,
                  receivedAmount: laptopStatus.ongoingApplicationInfo.receivedAmount,
                  approvedAmount: laptopStatus.ongoingApplicationInfo.approvedAmount,
                };
              }

              // 判斷資格：滿一年 + 沒有正在領取中的申請
              let eligible = true;
              let ineligibleReason = '';

              if (!oneYearCompleted) {
                eligible = false;
                ineligibleReason = 'Requires 1 year';
              } else if (laptopStatus.hasOngoingApplication) {
                eligible = false;
                ineligibleReason = 'Previous not completed';
              }

              subsidies.push({
                type,
                displayName: config.displayName,
                totalLimit: 0, // 筆電補助不顯示總額度
                usedAmount: laptopUsedAmount,
                availableAmount: 0, // 筆電補助不顯示可用額度
                eligible,
                ineligibleReason,
                annualLimit: config.annualLimit,
                laptopInstallmentInfo,
              });

              return; // 跳過後續的一般處理邏輯
            }

            // 健檢補助：年資累進終身累計制
            if (type === SubsidyType.HealthCheck && config.lifetimeCumulative) {
              const completedYears = this.calculateCompletedYears(startDateObj);
              const earned = completedYears * (config.yearlyIncrement || config.annualLimit);
              const lifetimeUsed = lifetimeHealthCheck?.totalAmount || 0;

              // available = min(earned - lifetimeUsed, maxAvailable)
              availableAmount = Math.min(
                earned - lifetimeUsed,
                config.maxAvailable || Infinity
              );
              totalLimit = Math.min(earned, config.maxAvailable || Infinity);

              // 判斷資格
              let eligible = true;
              let ineligibleReason = '';

              if (completedYears < 1) {
                eligible = false;
                ineligibleReason = 'Requires 1 year';
              } else if (availableAmount <= 0) {
                eligible = false;
                ineligibleReason = 'Quota exceeded';
              }

              subsidies.push({
                type,
                displayName: config.displayName,
                totalLimit,
                usedAmount: lifetimeUsed,
                availableAmount: Math.max(0, availableAmount),
                eligible,
                ineligibleReason,
                annualLimit: config.annualLimit,
              });
            } else {
              availableAmount = config.annualLimit - usedAmount;

              // 判斷資格
              let eligible = true;
              let ineligibleReason = '';

              if (config.requiresFullYear && !oneYearCompleted) {
                eligible = false;
                ineligibleReason = 'Requires 1 year';
              } else if (config.requiresProbationEnd && !probationPassed) {
                eligible = false;
                ineligibleReason = 'Requires probation (90d)';
              } else if (availableAmount <= 0) {
                eligible = false;
                ineligibleReason = 'Quota exceeded';
              }

              subsidies.push({
                type,
                displayName: config.displayName,
                totalLimit,
                usedAmount,
                availableAmount: Math.max(0, availableAmount),
                eligible,
                ineligibleReason,
                annualLimit: config.annualLimit,
              });
            }
          }
        });

        // 處理進修+AI聯合上限
        // AITool 額度包含在 Training 額度內，Training 使用會擠壓 AITool 可用額度
        const trainingDetail = subsidies.find(
          (s) => s.type === SubsidyType.Training
        );
        const aiDetail = subsidies.find((s) => s.type === SubsidyType.AITool);

        if (trainingDetail && aiDetail) {
          const trainingOnlyUsed = trainingDetail.usedAmount;
          const aiToolUsed = aiDetail.usedAmount;
          const combinedLimit = 24000;
          const aiToolBaseLimit = 10000;

          // Training 進度條：顯示合併使用量（Training + AITool）
          const combinedUsed = trainingOnlyUsed + aiToolUsed;
          trainingDetail.usedAmount = combinedUsed;
          trainingDetail.totalLimit = combinedLimit;
          trainingDetail.availableAmount = Math.max(0, combinedLimit - combinedUsed);
          trainingDetail.aiToolUsedAmount = aiToolUsed;
          trainingDetail.trainingOnlyUsedAmount = trainingOnlyUsed;

          // AITool 進度條：Training 使用超過 (24000 - 10000) = 14000 時，會擠壓 AITool 總額
          const aiToolEffectiveTotal = Math.min(
            aiToolBaseLimit,
            Math.max(0, combinedLimit - trainingOnlyUsed)
          );
          aiDetail.totalLimit = aiToolEffectiveTotal;
          aiDetail.usedAmount = aiToolUsed;
          aiDetail.availableAmount = Math.max(0, aiToolEffectiveTotal - aiToolUsed);

          // 更新資格狀態
          if (trainingDetail.availableAmount <= 0 && trainingDetail.eligible) {
            trainingDetail.eligible = false;
            trainingDetail.ineligibleReason = 'Quota exceeded';
          }
          if (aiDetail.availableAmount <= 0 && aiDetail.eligible) {
            aiDetail.eligible = false;
            aiDetail.ineligibleReason = 'Quota exceeded';
          }

          // 標註聯合限制
          trainingDetail.note = `Training + AI Tool 合計上限：${combinedLimit.toLocaleString()}`;
          aiDetail.note = `個別上限 ${aiToolBaseLimit.toLocaleString()}（Training 使用會擠壓 AI Tool 額度）`;
        }

        return {
          userId,
          period,
          yearsOfService,
          probationPassed,
          oneYearCompleted,
          subsidies,
        };
      })
    );
  }
}

/**
 * 補助限額配置
 */
export interface SubsidyLimitConfig {
  annualLimit: number;
  requiresFullYear: boolean;
  requiresProbationEnd: boolean;
  canCarryOver: boolean;
  maxCarryOver?: number;
  yearlyIncrement?: number;
  maxAvailable?: number;
  lifetimeCumulative?: boolean;
  displayName: string;
}

/**
 * 到職日週年期間
 */
export interface AnniversaryPeriod {
  periodStart: Date;
  periodEnd: Date;
  isCurrentPeriod: boolean;
  fiscalYear: number;
}

/**
 * 補助限額詳情
 *
 * Training 類型特殊欄位：
 * - usedAmount = Training 實際用量 + AITool 實際用量（合併顯示）
 * - totalLimit = 24,000（Training + AITool 聯合上限）
 * - aiToolUsedAmount / trainingOnlyUsedAmount 供堆疊進度條分色顯示
 *
 * AITool 類型特殊欄位：
 * - totalLimit = min(10,000, 24,000 − Training 單獨用量)（受 Training 擠壓）
 */
export interface SubsidyLimitDetail {
  type: SubsidyType;
  displayName: string;
  totalLimit: number;
  usedAmount: number;
  availableAmount: number;
  eligible: boolean;
  ineligibleReason: string;
  annualLimit: number;
  note?: string;
  laptopInstallmentInfo?: LaptopInstallmentInfo;
  /** Training 進度條用：AI Tool 已使用金額（包含在 Training 合計中） */
  aiToolUsedAmount?: number;
  /** Training 進度條用：純 Training 已使用金額 */
  trainingOnlyUsedAmount?: number;
}

/**
 * 使用者補助限額狀態
 */
export interface UserSubsidyLimitStatus {
  userId: string;
  period: AnniversaryPeriod;
  yearsOfService: number;
  probationPassed: boolean;
  oneYearCompleted: boolean;
  subsidies: SubsidyLimitDetail[];
}

/**
 * 筆電補助領取狀態
 */
export interface LaptopInstallmentStatus {
  totalReceivedAmount: number;
  totalReceivedCount: number;
  hasOngoingApplication: boolean;
  ongoingApplicationInfo: {
    receivedCount: number;
    receivedAmount: number;
    approvedAmount: number;
  } | null;
}

/**
 * 筆電補助領取資訊（用於顯示）
 */
export interface LaptopInstallmentInfo {
  receivedCount: number;
  receivedAmount: number;
  approvedAmount: number;
}
