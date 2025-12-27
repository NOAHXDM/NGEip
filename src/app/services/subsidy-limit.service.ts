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
import { differenceInDays, addYears, startOfDay, isBefore } from 'date-fns';
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
      canCarryOver: true,
      maxCarryOver: 12000,
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
   * 取得使用者在當前到職日週年期間的補助使用情況
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

    // 查詢當前週年期間的補助統計（使用 fiscalYear）
    const currentPeriodStats$ = this.subsidyStatsService.getUserAllSubsidyStats(
      userId,
      period.fiscalYear
    );

    // 健檢補助需要查詢前一年的統計（計算累積額度）
    const previousYearStats$ =
      this.subsidyStatsService.getUserSubsidyStatsByType(
        userId,
        SubsidyType.HealthCheck,
        period.fiscalYear - 1
      );

    // 筆電補助需要查詢所有時間的領取狀態
    const laptopStatus$ = this.getUserLaptopInstallmentStatus(userId);

    return combineLatest([currentPeriodStats$, previousYearStats$, laptopStatus$]).pipe(
      map(([currentStats, previousHealthCheck, laptopStatus]) => {
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

            // 健檢補助：計算累積額度
            if (type === SubsidyType.HealthCheck && config.canCarryOver) {
              const previousUsed = previousHealthCheck?.totalAmount || 0;
              const previousRemaining = config.annualLimit - previousUsed;
              const carryOverAmount = Math.max(0, previousRemaining);

              totalLimit = Math.min(
                config.annualLimit + carryOverAmount,
                config.maxCarryOver || config.annualLimit
              );
              availableAmount = totalLimit - usedAmount;
            } else {
              availableAmount = config.annualLimit - usedAmount;
            }

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
              // 額度已用完或超過
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
        });

        // 處理進修+AI聯合上限
        const trainingDetail = subsidies.find(
          (s) => s.type === SubsidyType.Training
        );
        const aiDetail = subsidies.find((s) => s.type === SubsidyType.AITool);

        if (trainingDetail && aiDetail) {
          const combinedUsed = trainingDetail.usedAmount + aiDetail.usedAmount;
          const combinedLimit = 24000;
          const combinedAvailable = Math.max(0, combinedLimit - combinedUsed);

          // 調整個別可用額度（不能超過聯合剩餘額度）
          trainingDetail.availableAmount = Math.min(
            trainingDetail.availableAmount,
            combinedAvailable
          );
          aiDetail.availableAmount = Math.min(
            aiDetail.availableAmount,
            combinedAvailable
          );

          // 如果調整後額度為 0，且原本是 eligible，則更新為 ineligible
          if (trainingDetail.availableAmount <= 0 && trainingDetail.eligible) {
            trainingDetail.eligible = false;
            trainingDetail.ineligibleReason = 'Quota exceeded';
          }
          if (aiDetail.availableAmount <= 0 && aiDetail.eligible) {
            aiDetail.eligible = false;
            aiDetail.ineligibleReason = 'Quota exceeded';
          }

          // 標註聯合限制
          trainingDetail.note = `Combined limit with AI Tool: ${combinedLimit.toLocaleString()}`;
          aiDetail.note = `Individual limit: ${aiDetail.annualLimit.toLocaleString()}, Combined with Training: ${combinedLimit.toLocaleString()}`;
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
