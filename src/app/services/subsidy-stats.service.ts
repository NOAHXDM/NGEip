import { inject, Injectable } from '@angular/core';
import {
  collection,
  collectionData,
  Firestore,
  query,
  where,
  Timestamp,
  getDocs,
} from '@angular/fire/firestore';
import { combineLatest, from, map, Observable } from 'rxjs';
import { SubsidyApplication, SubsidyType } from './subsidy.service';
import { UserMealStats } from './meal-subsidy.service';

@Injectable({
  providedIn: 'root',
})
export class SubsidyStatsService {
  readonly firestore: Firestore = inject(Firestore);

  /**
   * 取得使用者的補助統計（依類型）
   */
  getUserSubsidyStatsByType(
    userId: string,
    type: SubsidyType,
    year?: number
  ): Observable<SubsidyTypeStats> {
    const collectRef = collection(this.firestore, 'subsidyApplications');
    let constraints = [
      where('userId', '==', userId),
      where('type', '==', type),
      where('status', '==', 'approved'),
    ];

    if (year) {
      const startDate = Timestamp.fromDate(new Date(year, 0, 1));
      const endDate = Timestamp.fromDate(new Date(year + 1, 0, 1));
      constraints.push(
        where('applicationDate', '>=', startDate),
        where('applicationDate', '<', endDate)
      );
    }

    return (
      collectionData(query(collectRef, ...constraints), {
        idField: 'id',
      }) as Observable<SubsidyApplication[]>
    ).pipe(
      map((applications) => {
        const totalAmount = applications.reduce(
          (sum, app) => sum + (app.approvedAmount || 0),
          0
        );
        const count = applications.length;
        return {
          type,
          totalAmount,
          count,
          applications,
        };
      })
    );
  }

  /**
   * 取得使用者的所有補助統計摘要
   */
  getUserAllSubsidyStats(
    userId: string,
    year?: number
  ): Observable<SubsidySummary> {
    const types = [
      SubsidyType.Laptop,
      SubsidyType.HealthCheck,
      SubsidyType.Training,
      SubsidyType.AITool,
      SubsidyType.Travel,
    ];

    return combineLatest(
      types.map((type) => this.getUserSubsidyStatsByType(userId, type, year))
    ).pipe(
      map((statsArray) => {
        const totalAmount = statsArray.reduce(
          (sum, stats) => sum + stats.totalAmount,
          0
        );
        const totalCount = statsArray.reduce(
          (sum, stats) => sum + stats.count,
          0
        );

        return {
          userId,
          year,
          totalAmount,
          totalCount,
          byType: statsArray,
        };
      })
    );
  }

  /**
   * 取得系統整體補助統計（依類型）
   */
  getSystemSubsidyStatsByType(
    type: SubsidyType,
    year?: number
  ): Observable<SubsidyTypeStats> {
    const collectRef = collection(this.firestore, 'subsidyApplications');
    let constraints = [
      where('type', '==', type),
      where('status', '==', 'approved'),
    ];

    if (year) {
      const startDate = Timestamp.fromDate(new Date(year, 0, 1));
      const endDate = Timestamp.fromDate(new Date(year + 1, 0, 1));
      constraints.push(
        where('applicationDate', '>=', startDate),
        where('applicationDate', '<', endDate)
      );
    }

    return (
      collectionData(query(collectRef, ...constraints), {
        idField: 'id',
      }) as Observable<SubsidyApplication[]>
    ).pipe(
      map((applications) => {
        const totalAmount = applications.reduce(
          (sum, app) => sum + (app.approvedAmount || 0),
          0
        );
        const count = applications.length;
        const userCount = new Set(applications.map((app) => app.userId)).size;

        return {
          type,
          totalAmount,
          count,
          userCount,
          applications,
        };
      })
    );
  }

  /**
   * 取得系統整體補助統計摘要
   */
  getSystemAllSubsidyStats(year?: number): Observable<SystemSubsidySummary> {
    const types = [
      SubsidyType.Laptop,
      SubsidyType.HealthCheck,
      SubsidyType.Training,
      SubsidyType.AITool,
      SubsidyType.Travel,
    ];

    return combineLatest(
      types.map((type) => this.getSystemSubsidyStatsByType(type, year))
    ).pipe(
      map((statsArray) => {
        const totalAmount = statsArray.reduce(
          (sum, stats) => sum + stats.totalAmount,
          0
        );
        const totalCount = statsArray.reduce(
          (sum, stats) => sum + stats.count,
          0
        );
        const allUserIds = new Set<string>();
        statsArray.forEach((stats) => {
          stats.applications.forEach((app) => allUserIds.add(app.userId));
        });

        return {
          year,
          totalAmount,
          totalCount,
          totalUsers: allUserIds.size,
          byType: statsArray,
        };
      })
    );
  }

  /**
   * 取得使用者餐費統計（年度）
   */
  getUserMealStats(
    userId: string,
    year: number
  ): Observable<UserMealStats[]> {
    const collectRef = collection(this.firestore, 'userMealStats');
    return collectionData(
      query(
        collectRef,
        where('userId', '==', userId),
        where('yearMonth', '>=', `${year}-01`),
        where('yearMonth', '<=', `${year}-12`)
      ),
      { idField: 'id' }
    ) as Observable<UserMealStats[]>;
  }

  /**
   * 取得系統整體餐費統計（月度）
   */
  getSystemMealStatsByMonth(yearMonth: string): Observable<SystemMealStats> {
    const collectRef = collection(this.firestore, 'userMealStats');
    return (
      collectionData(query(collectRef, where('yearMonth', '==', yearMonth)), {
        idField: 'id',
      }) as Observable<UserMealStats[]>
    ).pipe(
      map((stats) => {
        const totalAmount = stats.reduce(
          (sum, s) => sum + s.totalAmount,
          0
        );
        const totalMealCount = stats.reduce(
          (sum, s) => sum + s.mealCount,
          0
        );
        const userCount = stats.length;

        return {
          yearMonth,
          totalAmount,
          totalMealCount,
          userCount,
          averagePerUser: userCount > 0 ? totalAmount / userCount : 0,
          details: stats,
        };
      })
    );
  }

  /**
   * 取得系統整體餐費統計（年度）
   */
  getSystemMealStatsByYear(year: number): Observable<SystemMealStats[]> {
    const collectRef = collection(this.firestore, 'userMealStats');
    return from(
      getDocs(
        query(
          collectRef,
          where('yearMonth', '>=', `${year}-01`),
          where('yearMonth', '<=', `${year}-12`)
        )
      )
    ).pipe(
      map((snapshot) => {
        const allStats = snapshot.docs.map(
          (doc) => doc.data() as UserMealStats
        );

        // 依月份分組
        const statsByMonth = new Map<string, UserMealStats[]>();
        allStats.forEach((stat) => {
          const month = stat.yearMonth;
          if (!statsByMonth.has(month)) {
            statsByMonth.set(month, []);
          }
          statsByMonth.get(month)!.push(stat);
        });

        // 計算每月統計
        const monthlyStats: SystemMealStats[] = [];
        for (let i = 1; i <= 12; i++) {
          const yearMonth = `${year}-${i.toString().padStart(2, '0')}`;
          const monthStats = statsByMonth.get(yearMonth) || [];

          const totalAmount = monthStats.reduce(
            (sum, s) => sum + s.totalAmount,
            0
          );
          const totalMealCount = monthStats.reduce(
            (sum, s) => sum + s.mealCount,
            0
          );
          const userCount = monthStats.length;

          monthlyStats.push({
            yearMonth,
            totalAmount,
            totalMealCount,
            userCount,
            averagePerUser: userCount > 0 ? totalAmount / userCount : 0,
            details: monthStats,
          });
        }

        return monthlyStats;
      })
    );
  }

  /**
   * 取得使用者的年度總補助額（包含所有類型補助 + 餐費）
   */
  getUserTotalSubsidy(
    userId: string,
    year: number
  ): Observable<UserTotalSubsidy> {
    return combineLatest([
      this.getUserAllSubsidyStats(userId, year),
      this.getUserMealStats(userId, year),
    ]).pipe(
      map(([subsidyStats, mealStats]) => {
        const totalMealAmount = mealStats.reduce(
          (sum, s) => sum + s.totalAmount,
          0
        );
        const totalMealCount = mealStats.reduce(
          (sum, s) => sum + s.mealCount,
          0
        );

        return {
          userId,
          year,
          totalSubsidyAmount: subsidyStats.totalAmount,
          totalSubsidyCount: subsidyStats.totalCount,
          totalMealAmount,
          totalMealCount,
          grandTotal: subsidyStats.totalAmount + totalMealAmount,
          subsidyByType: subsidyStats.byType,
          mealByMonth: mealStats,
        };
      })
    );
  }

  /**
   * 取得各類型補助的 Top 5 使用者排行
   */
  getTopUsersByType(
    type: SubsidyType,
    year?: number,
    limit: number = 5
  ): Observable<UserRanking[]> {
    const collectRef = collection(this.firestore, 'subsidyApplications');
    let constraints = [
      where('type', '==', type),
      where('status', '==', 'approved'),
    ];

    if (year) {
      const startDate = Timestamp.fromDate(new Date(year, 0, 1));
      const endDate = Timestamp.fromDate(new Date(year + 1, 0, 1));
      constraints.push(
        where('applicationDate', '>=', startDate),
        where('applicationDate', '<', endDate)
      );
    }

    return (
      collectionData(query(collectRef, ...constraints), {
        idField: 'id',
      }) as Observable<SubsidyApplication[]>
    ).pipe(
      map((applications) => {
        // 依使用者分組統計
        const userStats = new Map<string, { totalAmount: number; count: number }>();

        applications.forEach((app) => {
          const current = userStats.get(app.userId) || { totalAmount: 0, count: 0 };
          userStats.set(app.userId, {
            totalAmount: current.totalAmount + (app.approvedAmount || 0),
            count: current.count + 1,
          });
        });

        // 轉換為排行陣列並排序
        const rankings: UserRanking[] = Array.from(userStats.entries()).map(
          ([userId, stats]) => ({
            userId,
            totalAmount: stats.totalAmount,
            count: stats.count,
          })
        );

        // 依金額由高到低排序，取前 N 名
        return rankings
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, limit);
      })
    );
  }

  /**
   * 取得餐費補助的 Top 5 使用者排行
   */
  getTopUsersByMeal(year: number, limit: number = 5): Observable<UserRanking[]> {
    const collectRef = collection(this.firestore, 'userMealStats');
    return from(
      getDocs(
        query(
          collectRef,
          where('yearMonth', '>=', `${year}-01`),
          where('yearMonth', '<=', `${year}-12`)
        )
      )
    ).pipe(
      map((snapshot) => {
        // 依使用者分組統計
        const userStats = new Map<string, { totalAmount: number; count: number }>();

        snapshot.docs.forEach((doc) => {
          const stat = doc.data() as UserMealStats;
          const current = userStats.get(stat.userId) || { totalAmount: 0, count: 0 };
          userStats.set(stat.userId, {
            totalAmount: current.totalAmount + stat.totalAmount,
            count: current.count + stat.mealCount,
          });
        });

        // 轉換為排行陣列並排序
        const rankings: UserRanking[] = Array.from(userStats.entries()).map(
          ([userId, stats]) => ({
            userId,
            totalAmount: stats.totalAmount,
            count: stats.count,
          })
        );

        // 依金額由高到低排序，取前 N 名
        return rankings
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, limit);
      })
    );
  }

  /**
   * 取得所有補助類型的 Top 5 排行榜（包含餐費）
   */
  getAllTopUsers(year?: number): Observable<AllTopUsers> {
    const types = [
      SubsidyType.Laptop,
      SubsidyType.HealthCheck,
      SubsidyType.Training,
      SubsidyType.AITool,
      SubsidyType.Travel,
    ];

    const topByType$ = types.map((type) =>
      this.getTopUsersByType(type, year).pipe(
        map((rankings) => ({ type, rankings }))
      )
    );

    return combineLatest([
      ...topByType$,
      year ? this.getTopUsersByMeal(year) : from([[]])
    ]).pipe(
      map((results) => {
        const topByType = results.slice(0, -1) as { type: SubsidyType; rankings: UserRanking[] }[];
        const topMeal = results[results.length - 1] as UserRanking[];

        return {
          laptop: topByType.find(r => r.type === SubsidyType.Laptop)?.rankings || [],
          healthCheck: topByType.find(r => r.type === SubsidyType.HealthCheck)?.rankings || [],
          training: topByType.find(r => r.type === SubsidyType.Training)?.rankings || [],
          aiTool: topByType.find(r => r.type === SubsidyType.AITool)?.rankings || [],
          travel: topByType.find(r => r.type === SubsidyType.Travel)?.rankings || [],
          meal: topMeal,
        };
      })
    );
  }
}

/**
 * 補助類型統計
 */
export interface SubsidyTypeStats {
  type: SubsidyType;
  totalAmount: number;
  count: number;
  userCount?: number; // 僅系統統計使用
  applications: SubsidyApplication[];
}

/**
 * 使用者補助摘要
 */
export interface SubsidySummary {
  userId: string;
  year?: number;
  totalAmount: number;
  totalCount: number;
  byType: SubsidyTypeStats[];
}

/**
 * 系統補助摘要
 */
export interface SystemSubsidySummary {
  year?: number;
  totalAmount: number;
  totalCount: number;
  totalUsers: number;
  byType: SubsidyTypeStats[];
}

/**
 * 系統餐費統計
 */
export interface SystemMealStats {
  yearMonth: string;
  totalAmount: number;
  totalMealCount: number;
  userCount: number;
  averagePerUser: number;
  details: UserMealStats[];
}

/**
 * 使用者年度總補助
 */
export interface UserTotalSubsidy {
  userId: string;
  year: number;
  totalSubsidyAmount: number;
  totalSubsidyCount: number;
  totalMealAmount: number;
  totalMealCount: number;
  grandTotal: number;
  subsidyByType: SubsidyTypeStats[];
  mealByMonth: UserMealStats[];
}

/**
 * 使用者排行
 */
export interface UserRanking {
  userId: string;
  totalAmount: number;
  count: number;
}

/**
 * 所有補助類型的 Top 排行榜
 */
export interface AllTopUsers {
  laptop: UserRanking[];
  healthCheck: UserRanking[];
  training: UserRanking[];
  aiTool: UserRanking[];
  travel: UserRanking[];
  meal: UserRanking[];
}
