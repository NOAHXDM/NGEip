import { Injectable, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import {
  Auth,
  User as FirebaseUser,
  authState,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from '@angular/fire/auth';
import {
  FieldValue,
  Firestore,
  Timestamp,
  collection,
  collectionData,
  doc,
  docData,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { subMonths, subYears } from 'date-fns';
import {
  catchError,
  combineLatest,
  defer,
  from,
  map,
  Observable,
  of,
  shareReplay,
  switchMap,
} from 'rxjs';

import { License } from './system-config.service';
import { StorageService } from './storage.service';
import { TimezoneService } from './timezone.service';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly auth = inject(Auth);
  private readonly firestore: Firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);
  private readonly authState$: Observable<FirebaseUser | null> = authState(
    this.auth
  );
  readonly currentUser$ = this.authState$.pipe(
    switchMap((user) =>
      runInInjectionContext(this.injector, () =>
        docData(doc(this.firestore, 'users', user!.uid), {
          idField: 'uid',
        }) as Observable<User>
      )
    ),
    shareReplay(1)
  );
  readonly list$ = combineLatest([
    this.currentUser$,
    // defer：延後 collection 查詢至實際訂閱時才建立，避免欄位初始化階段即呼叫
    // Firebase SDK（同時讓服務在單元測試中可被建構）。
    defer(() =>
      collectionData(
        query(collection(this.firestore, 'users'), orderBy('startDate', 'asc')),
        {
          idField: 'uid',
        }
      )
    ),
  ]).pipe(
    map(([currentUser, users]) => {
      const excludeMyself = users.filter(
        (user) => user.uid != currentUser.uid
      ) as User[];
      return [currentUser, ...excludeMyself];
    }),
    shareReplay(1)
  );
  readonly isAdmin$ = this.currentUser$.pipe(
    map((user) => user.role == 'admin')
  );
  readonly timezoneService = inject(TimezoneService);
  private readonly storageService = inject(StorageService);

  /**
   * Firestore 模組層級函式的 seam：以 instance 屬性持有，供單元測試直接覆寫攔截，
   * 規避 ES module 匯出 non-configurable 無法 spyOn 的限制（與 evaluation 服務同策略）。
   */
  readonly _fn = { doc, updateDoc };

  createUser(email: string, password: string, name: string) {
    let totalUsers = 0;
    let activeUserCount = 0;
    return from(
      (async () => {
        // Check users has the duplicate email
        const emailQuery = query(
          collection(this.firestore, 'users'),
          where('email', '==', email)
        );
        const usersCollection = collection(this.firestore, 'users');

        const [emailSnapshot, usersSnapshot] = await Promise.all([
          getDocs(emailQuery),
          getDocs(usersCollection),
        ]);

        if (!emailSnapshot.empty) {
          throw new Error('電子郵件已存在');
        }

        totalUsers = usersSnapshot.size;
        activeUserCount = usersSnapshot.docs.filter(
          (userDoc) => !(userDoc.data() as User).exitDate
        ).length;
      })()
    ).pipe(
      switchMap(() =>
        from(
          runTransaction(this.firestore, async (transaction) => {
            // License capacity is derived from active users, not a stored counter.
            const systemConfigDoc = await transaction.get(
              doc(this.firestore, 'systemConfig', 'license')
            );
            const systemConfig = systemConfigDoc.data() as License;
            if (activeUserCount >= systemConfig.maxUsers) {
              throw new Error(
                '已達到最大使用者數量。請聯繫您的系統管理員。'
              );
            }
            // Create user
            let uid: string;
            try {
              const userCredential = await createUserWithEmailAndPassword(
                this.auth,
                email,
                password
              );
              uid = userCredential.user.uid;
            } catch (error: any) {
              throw new Error(error.message);
            }
            // Add a new document with a uid
            const user: User = {
              email,
              name,
              remainingLeaveHours: 0,
              remoteWorkEligibility: 'N/A',
              remoteWorkRecommender: [],
              role: totalUsers ? 'user' : 'admin', // First user is admin, others are user
              startDate: serverTimestamp(),
            };
            transaction.set(doc(this.firestore, 'users', uid), user);
          })
        )
      )
    );
  }

  updateUser(user: User) {
    const docRef = this._fn.doc(this.firestore, 'users', user.uid!);
    const data = {
      name: user.name,
      phone: user.phone,
      remoteWorkEligibility: user.remoteWorkEligibility,
      remoteWorkRecommender: user.remoteWorkRecommender,
      birthday: user.birthday,
    };
    return from(this._fn.updateDoc(docRef, data));
  }

  updateUserPhotoUrl(user: User) {
    const docRef = this._fn.doc(this.firestore, 'users', user.uid!);
    const data = {
      photoUrl: user.photoUrl,
    };
    return from(this._fn.updateDoc(docRef, data));
  }

  updateUserAdvanced(user: User) {
    const docRef = this._fn.doc(this.firestore, 'users', user.uid!);
    const data = {
      jobRank: user.jobRank,
      jobTitle: user.jobTitle,
      role: user.role,
      startDate: user.startDate,
      exitDate: user.exitDate,
    };

    if (!data.exitDate) {
      return from(this._fn.updateDoc(docRef, data));
    }

    // 離職：一併清除頭像參照，並於更新成功後刪除 Storage 頭像檔
    // （孤兒檔清理第二道防線）。清理失敗不影響離職流程，
    // 留待 storage-orphan-audit 稽核腳本兜底。
    return from(this._fn.updateDoc(docRef, { ...data, photoUrl: '' })).pipe(
      switchMap(() =>
        this.storageService
          .deleteAvatar(user.uid!)
          .pipe(catchError(() => of(void 0)))
      )
    );
  }

  updateRemainingLeaveHours(data: LeaveTransaction) {
    return from(
      runTransaction(this.firestore, async (transaction) => {
        const userRef = doc(this.firestore, 'users', data.uid!);
        const userSnapshot = await transaction.get(userRef);
        const leaveTransactionHistoryCollectionRef = collection(
          userRef,
          'leaveTransactionHistory'
        );
        const newleaveTransactionHistoryDocRef = doc(
          leaveTransactionHistoryCollectionRef
        );

        const { remainingLeaveHours } = userSnapshot.data() as User;
        const leaveTransactionHistory = {
          actionBy: data.actionBy,
          date: serverTimestamp(),
          hours: data.hours,
          reason: data.reason,
        };

        transaction
          .update(userRef, {
            remainingLeaveHours: remainingLeaveHours + data.hours,
          })
          .set(newleaveTransactionHistoryDocRef, leaveTransactionHistory);
      })
    );
  }

  leaveTransactionHistory(uid: string) {
    const oneYearAgo = subYears(new Date(), 1);

    return collectionData(
      query(
        collection(this.firestore, 'users', uid, 'leaveTransactionHistory'),
        where(
          'date',
          '>=',
          this.timezoneService.convertTimestampByClientTimezone(oneYearAgo)
        ),
        orderBy('date', 'desc')
      ),
      { idField: 'id' }
    ) as Observable<LeaveTransaction[]>;
  }

  login(email: string, password: string) {
    return from(signInWithEmailAndPassword(this.auth, email, password));
  }

  logout() {
    return from(signOut(this.auth));
  }

  getUsersWithinExitWindow(referenceDate: Date = new Date(), months = 2) {
    return this.list$.pipe(
      map((users) => this.filterUsersWithinExitWindow(users, referenceDate, months))
    );
  }

  filterUsersWithinExitWindow(
    users: User[],
    referenceDate: Date = new Date(),
    months = 2
  ): User[] {
    const cutoffDate = subMonths(referenceDate, months);
    return users.filter((user) => {
      if (!user.exitDate) return true;
      const exitDate = (user.exitDate as Timestamp).toDate();
      return exitDate >= cutoffDate;
    });
  }
}

export interface User {
  birthday?: Timestamp | FieldValue;
  email: string;
  jobRank?: string;
  jobTitle?: string;
  leaveTransactionHistory?: LeaveTransaction[]; // 休假交易紀錄
  name: string;
  phone?: string;
  photoUrl?: string;
  remainingLeaveHours: number; // 剩餘特休時數
  remoteWorkEligibility: 'N/A' | 'WFH2' | 'WFH4.5'; // 遠距工作資格
  remoteWorkRecommender: string[];
  role: 'admin' | 'user';
  startDate?: Timestamp | FieldValue; // 到職日
  exitDate?: Timestamp | FieldValue; // 離職日
  uid?: string;
}

export interface LeaveTransaction {
  actionBy: string;
  date: Timestamp | FieldValue;
  hours: number;
  reason: string;
  uid?: string;
}
