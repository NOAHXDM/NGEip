import { Component, inject, signal } from '@angular/core';
import { FirebaseError } from '@angular/fire/app';
import { MatIconModule } from '@angular/material/icon';
import {
  Auth,
  authState,
  createUserWithEmailAndPassword,
  signOut,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from '@angular/fire/auth';
import {
  FormGroup,
  FormControl,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Firestore,
  setDoc,
  doc,
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
  getDocs,
  query,
  where,
  getDoc,
} from '@angular/fire/firestore';
import { Observable, from, take } from 'rxjs';
import { User, UserService } from '../services/user.service';

@Component({
  selector: 'app-codelab',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule],
  templateUrl: './codelab.component.html',
  styleUrl: './codelab.component.scss',
})
export class CodelabComponent {
  // readonly auth = inject(Auth);
  // readonly authState$: Observable<User | null> = authState(this.auth);
  // readonly loggedIn = signal<boolean>(false);
  // registerForm = new FormGroup({
  //   email: new FormControl('', [Validators.required, Validators.email]),
  //   password: new FormControl('', [Validators.required]),
  // });
  // loginForm = new FormGroup({
  //   email: new FormControl('', [Validators.required, Validators.email]),
  //   password: new FormControl('', [Validators.required]),
  // });
  // forgotPasswordForm = new FormGroup({
  //   email: new FormControl('', [Validators.required, Validators.email]),
  // });
  // Firestore
  // readonly firestore: Firestore = inject(Firestore);
  // constructor() {
  //   this.authState$.pipe(takeUntilDestroyed()).subscribe((user) => {
  //     console.log('User:', user);
  //     this.loggedIn.set(!!user);
  //   });
  // query data from Firestore where timestamp is less than 2024-12-21
  // const dec212024 = Timestamp.fromDate(new Date(2024, 11, 21));
  // const logsRef = collection(this.firestore, 'loginLogs');
  // const q = query(logsRef, where('timestamp', '<', dec212024));
  // from(getDocs(q))
  //   .pipe(take(1))
  //   .subscribe({
  //     next: (docsRef) => {
  //       docsRef.forEach((doc) => {
  //         console.log(doc.data());
  //         const docTimestamp: Timestamp = doc.data()['timestamp'];
  //         console.log(docTimestamp.toDate())
  //       });
  //     },
  //   });
  // from(getDoc(doc(this.firestore, 'users', '8s7LEeW98IoyM8NwidVJFbf4Jctj')))
  //   .pipe(take(1))
  //   .subscribe({
  //     next: (value) => console.log('getDoc', value.data()),
  //   });
  list$: Observable<User[]>;
  userArray: User[] = [];
  constructor(private userService: UserService) {
    this.list$ = this.userService.list$;
  }

  profile() {
    this.list$.pipe(take(1)).subscribe({
      next: (A) => {
        this.userArray = A;
      },
    });
  }
}

// register() {
//   console.warn(this.registerForm.value);
//   const value = this.registerForm.value;
//   from(
//     createUserWithEmailAndPassword(this.auth, value.email!, value.password!)
//   )
//     .pipe(take(1))
//     .subscribe((userCredential) => {
//       console.log('User created!', userCredential);
//       const { uid, email } = userCredential.user;

//       // Add a new document with a uid
//       from(setDoc(doc(this.firestore, 'users', uid), { email, role: 'user' }))
//         .pipe(take(1))
//         .subscribe({
//           next: () => {
//             console.log('Document written with ID:', uid);
//           },
//           error: (error) => {
//             console.error('Error adding document:', error);
//           },
//         });
//     });
// }

// login() {
//   console.warn(this.loginForm.value);
//   const value = this.loginForm.value;
//   from(signInWithEmailAndPassword(this.auth, value.email!, value.password!))
//     .pipe(take(1))
//     .subscribe({
//       next: (userCredential) => {
//         console.log('User logged in!', userCredential);
//         // Add a new document with id automatically generated
//         from(
//           addDoc(collection(this.firestore, 'loginLogs'), {
//             uid: userCredential.user.uid,
//             timestamp: serverTimestamp(),
//           })
//         )
//           .pipe(take(1))
//           .subscribe({
//             next: (documentRef) => {
//               console.log('Document written: ', documentRef.id);
//             },
//             error: (error) => {
//               console.error('Error adding document:', error);
//             },
//           });
//       },
//       error: (error: FirebaseError) => {
//         console.warn('Error:', error);
//       },
//     });
// }

// logout() {
//   from(signOut(this.auth)).pipe(take(1)).subscribe();
// }

// forgotPassword() {
//   console.warn(this.forgotPasswordForm.value);
//   const value = this.forgotPasswordForm.value;
//   from(sendPasswordResetEmail(this.auth, value.email!))
//     .pipe(take(1))
//     .subscribe({
//       next: () => {
//         console.info('email sent.');
//       },
//       error: (error: FirebaseError) => {
//         console.warn('Error:', error);
//       },
//     });
// }
// content = '建立代辦事項';
// state: 'none' | 'doing' | 'finish' = 'none';
// onSetState(state: 'none' | 'doing' | 'finish'): void {
//   this.state = state;
// }

// isChecked: boolean = false;
// toggleChecked() {
//   this.isChecked = !this.isChecked;
// }
