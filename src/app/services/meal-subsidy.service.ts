import { inject, Injectable, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import {
  collection,
  collectionData,
  doc,
  docData,
  Firestore,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  FieldValue,
} from '@angular/fire/firestore';
import { format } from 'date-fns';
import { from, Observable, of, switchMap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class MealSubsidyService {
  readonly firestore: Firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  /**
   * 取得特定日期的餐點記錄
   */
  getDailyMeal(dateId: string): Observable<DailyMealRecord | undefined> {
    const docRef = doc(this.firestore, 'mealSubsidies', dateId);
    return runInInjectionContext(this.injector, () =>
      docData(docRef, { idField: 'id' }) as Observable<
        DailyMealRecord | undefined
      >
    );
  }

  /**
   * 依日期範圍查詢餐點記錄
   */
  searchByDateRange(
    startDate: Date,
    endDate: Date
  ): Observable<DailyMealRecord[]> {
    const collectRef = collection(this.firestore, 'mealSubsidies');
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    return collectionData(
      query(
        collectRef,
        where('date', '>=', startTimestamp),
        where('date', '<', endTimestamp),
        orderBy('date', 'desc')
      ),
      { idField: 'id' }
    ) as Observable<DailyMealRecord[]>;
  }

  /**
   * 儲存每日餐點記錄（含自動更新使用者月度統計）
   */
  saveDailyMeal(
    dateId: string,
    mealRecord: Omit<DailyMealRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Observable<void> {
    const data: Omit<DailyMealRecord, 'id'> = {
      ...mealRecord,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = doc(this.firestore, 'mealSubsidies', dateId);

    return from(
      runTransaction(this.firestore, async (transaction) => {
        const dateObj = (mealRecord.date as Timestamp).toDate();
        const yearMonth = format(dateObj, 'yyyy-MM');

        // 步驟 1：先執行所有讀取操作
        const statsReads = await Promise.all(
          mealRecord.meals.map(async (meal) => {
            const statsId = `${meal.userId}_${yearMonth}`;
            const statsRef = doc(this.firestore, 'userMealStats', statsId);
            const statsDoc = await transaction.get(statsRef);
            return { meal, statsRef, statsDoc };
          })
        );

        // 步驟 2：執行所有寫入操作
        // 2.1 儲存每日餐點記錄
        transaction.set(docRef, data);

        // 2.2 更新每位用餐者的月度統計
        for (const { meal, statsRef, statsDoc } of statsReads) {
          if (statsDoc.exists()) {
            // 更新現有統計
            const currentData = statsDoc.data() as UserMealStats;
            const existingDetailIndex = currentData.details.findIndex(
              (d) => d.date === dateId
            );

            let newDetails = [...currentData.details];
            let newTotalAmount = currentData.totalAmount;
            let newMealCount = currentData.mealCount;

            if (existingDetailIndex >= 0) {
              // 更新現有日期的金額
              const oldAmount = newDetails[existingDetailIndex].amount;
              newDetails[existingDetailIndex] = {
                date: dateId,
                amount: meal.amount,
              };
              newTotalAmount = newTotalAmount - oldAmount + meal.amount;
            } else {
              // 新增新日期的記錄
              newDetails.push({ date: dateId, amount: meal.amount });
              newTotalAmount += meal.amount;
              newMealCount += 1;
            }

            transaction.update(statsRef, {
              totalAmount: newTotalAmount,
              mealCount: newMealCount,
              details: newDetails,
              updatedAt: serverTimestamp(),
            });
          } else {
            // 建立新統計記錄
            const newStats: Omit<UserMealStats, 'id'> = {
              userId: meal.userId,
              yearMonth,
              totalAmount: meal.amount,
              mealCount: 1,
              details: [{ date: dateId, amount: meal.amount }],
              updatedAt: serverTimestamp(),
            };
            transaction.set(statsRef, newStats);
          }
        }
      })
    ).pipe(switchMap(() => of(void 0)));
  }

  /**
   * 取得使用者月度餐費統計
   */
  getUserMonthlyStats(
    userId: string,
    yearMonth: string
  ): Observable<UserMealStats | undefined> {
    const statsId = `${userId}_${yearMonth}`;
    const docRef = doc(this.firestore, 'userMealStats', statsId);
    return runInInjectionContext(this.injector, () =>
      docData(docRef, { idField: 'id' }) as Observable<
        UserMealStats | undefined
      >
    );
  }

  /**
   * 取得使用者年度餐費統計
   */
  getUserYearlyStats(
    userId: string,
    year: number
  ): Observable<UserMealStats[]> {
    const collectRef = collection(this.firestore, 'userMealStats');
    const yearPrefix = `${year}`;

    return collectionData(
      query(
        collectRef,
        where('userId', '==', userId),
        where('yearMonth', '>=', `${yearPrefix}-01`),
        where('yearMonth', '<=', `${yearPrefix}-12`),
        orderBy('yearMonth', 'asc')
      ),
      { idField: 'id' }
    ) as Observable<UserMealStats[]>;
  }

  /**
   * 格式化日期為 dateId (YYYY-MM-DD)
   */
  formatDateId(date: Date): string {
    return format(date, 'yyyy-MM-dd');
  }

  /**
   * 取得當週的餐點記錄
   */
  getCurrentWeekMeals(): Observable<DailyMealRecord[]> {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 週日算上週
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);

    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);

    return this.searchByDateRange(monday, nextMonday);
  }

  /**
   * 取得當月的餐點記錄
   */
  getCurrentMonthMeals(): Observable<DailyMealRecord[]> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return this.searchByDateRange(startOfMonth, startOfNextMonth);
  }
}

export interface DailyMealRecord {
  id?: string;
  date: Timestamp | FieldValue;
  dayOfWeek: number;
  meals: MealEntry[];
  dailyTotal: number;
  userIds: string[];
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export interface MealEntry {
  userId: string;
  orderContent: string;
  amount: number;
}

export interface UserMealStats {
  id?: string;
  userId: string;
  yearMonth: string;
  totalAmount: number;
  mealCount: number;
  details: {
    date: string;
    amount: number;
  }[];
  updatedAt: Timestamp | FieldValue;
}
