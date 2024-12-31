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
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from '@angular/fire/firestore';
import { from, map, Observable, shareReplay, switchMap } from 'rxjs';

import { License } from './system-config.service';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly auth = inject(Auth);
  private readonly authState$: Observable<FirebaseUser | null> = authState(this.auth);
  readonly currentUser$ = this.authState$.pipe(
    switchMap((user) => {
      return from(getDoc(doc(this.firestore, 'users', user!.uid)));
    }),
    map(
      (userDoc) =>
        ({
          ...userDoc.data(),
          uid: userDoc.id,
        } as User & { uid: string })
    )
  );
  readonly firestore: Firestore = inject(Firestore);

  constructor() {}

  list() {
    return from(getDocs(collection(this.firestore, 'users'))).pipe(
      map((snapshot) =>
        snapshot.docs.map(
          (doc) =>
            ({
              ...doc.data(),
              uid: doc.id,
            } as User & { uid: string })
        )
      ),
      shareReplay(1)
    );
  }

  createUser(email: string, password: string, name: string) {
    return from(
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
        // Check users has the duplicate email
        const emailQuery = query(
          collection(this.firestore, 'users'),
          where('email', '==', email)
        );

        const emailSnapshot = await getDocs(emailQuery);
        if (!emailSnapshot.empty) {
          throw new Error('Email already exists');
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
          role: 'user',
        };
        transaction.set(doc(this.firestore, 'users', uid), user);
        // Update license
        transaction.update(doc(this.firestore, 'systemConfig', 'license'), {
          currentUsers: systemConfig.currentUsers + 1,
          lastUpdated: serverTimestamp(),
        });
      })
    );
  }

  login(email: string, password: string) {
    return from(signInWithEmailAndPassword(this.auth, email, password));
  }

  logout() {
    return from(signOut(this.auth));
  }
}

interface User {
  birthday?: Date;
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
  startDate?: Date; // 到職日
}

interface LeaveTransaction {
  actionBy?: string;
  date: Date;
  hours: number;
  reason?: string;
  type: 'add' | 'deduct';
}
