import { Injectable, inject } from '@angular/core';
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
  getCountFromServer,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { subYears } from 'date-fns';
import {
  combineLatest,
  from,
  map,
  Observable,
  shareReplay,
  switchMap,
} from 'rxjs';

import { License } from './system-config.service';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly auth = inject(Auth);
  private readonly authState$: Observable<FirebaseUser | null> = authState(
    this.auth
  );
  readonly currentUser$ = this.authState$.pipe(
    switchMap(
      (user) =>
        docData(doc(this.firestore, 'users', user!.uid), {
          idField: 'uid',
        }) as Observable<User>
    ),
    shareReplay(1)
  );
  readonly firestore: Firestore = inject(Firestore);
  readonly list$ = combineLatest([
    this.currentUser$,
    collectionData(
      query(collection(this.firestore, 'users'), orderBy('startDate', 'asc')),
      {
        idField: 'uid',
      }
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

  constructor() {}

  createUser(email: string, password: string, name: string) {
    let totalUsers = 0;
    return from(
      (async () => {
        // Check users has the duplicate email
        const emailQuery = query(
          collection(this.firestore, 'users'),
          where('email', '==', email)
        );
        const usersCollection = collection(this.firestore, 'users');

        const [emailSnapshot, countSnapshot] = await Promise.all([
          getDocs(emailQuery),
          getCountFromServer(usersCollection),
        ]);

        if (!emailSnapshot.empty) {
          throw new Error('Email already exists');
        }

        totalUsers = countSnapshot.data().count;
      })()
    ).pipe(
      switchMap(() =>
        from(
          runTransaction(this.firestore, async (transaction) => {
            // Check license
            const systemConfigDoc = await transaction.get(
              doc(this.firestore, 'systemConfig', 'license')
            );
            const systemConfig = systemConfigDoc.data() as License;
            if (systemConfig.currentUsers >= systemConfig.maxUsers) {
              throw new Error(
                'The maximum number of users has been reached. Please contact your administrator.'
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
            // Update license
            transaction.update(doc(this.firestore, 'systemConfig', 'license'), {
              currentUsers: systemConfig.currentUsers + 1,
              lastUpdated: serverTimestamp(),
            });
          })
        )
      )
    );
  }

  updateUser(user: User) {
    const docRef = doc(this.firestore, 'users', user.uid!);
    const data = {
      name: user.name,
      phone: user.phone,
      remoteWorkEligibility: user.remoteWorkEligibility,
      remoteWorkRecommender: user.remoteWorkRecommender,
      birthday: user.birthday,
    };
    return from(updateDoc(docRef, data));
  }

  updateUserAdvanced(user: User) {
    const docRef = doc(this.firestore, 'users', user.uid!);
    const data = {
      jobRank: user.jobRank,
      jobTitle: user.jobTitle,
      role: user.role,
      startDate: user.startDate,
    };
    return from(updateDoc(docRef, data));
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
        where('date', '>=', Timestamp.fromDate(oneYearAgo)),
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
}

export interface User {
  birthday?: Timestamp | FieldValue;
  email: string;
  jobRank?: string;
  jobTitle?: string;
  leaveTransactionHistory?: LeaveTransaction[]; // 休假交易紀錄
  name: string;
  phone?: string;
  photo?: string;
  remainingLeaveHours: number; // 剩餘特休時數
  remoteWorkEligibility: 'N/A' | 'WFH2' | 'WFH4.5'; // 遠距工作資格
  remoteWorkRecommender: string[];
  role: 'admin' | 'user';
  startDate?: Timestamp | FieldValue; // 到職日
  uid?: string;
}

export interface LeaveTransaction {
  actionBy: string;
  date: Timestamp | FieldValue;
  hours: number;
  reason: string;
  uid?: string;
}
