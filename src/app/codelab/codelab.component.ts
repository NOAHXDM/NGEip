import { Component, inject, signal } from '@angular/core';
import { FirebaseError } from '@angular/fire/app';
import {
  Auth,
  authState,
  createUserWithEmailAndPassword,
  User,
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
import { Observable, from, take } from 'rxjs';

@Component({
  selector: 'app-codelab',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './codelab.component.html',
  styleUrl: './codelab.component.scss',
})
export class CodelabComponent {
  private auth = inject(Auth);
  authState$: Observable<User> = authState(this.auth);
  loggedIn = signal<boolean>(false);
  registerForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required]),
  });
  loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required]),
  });
  forgotPasswordForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
  });

  constructor() {
    this.authState$.pipe(takeUntilDestroyed()).subscribe((user) => {
      console.log('User:', user);
      this.loggedIn.set(!!user);
    });
  }

  register() {
    console.warn(this.registerForm.value);
    const value = this.registerForm.value;
    from(
      createUserWithEmailAndPassword(this.auth, value.email!, value.password!)
    )
      .pipe(take(1))
      .subscribe((userCredential) => {
        console.log('User created!', userCredential);
        const uid = userCredential.user.uid;
      });
  }

  login() {
    console.warn(this.loginForm.value);
    const value = this.loginForm.value;
    from(signInWithEmailAndPassword(this.auth, value.email!, value.password!))
      .pipe(take(1))
      .subscribe({
        next: (userCredential) => {
          console.log('User logged in!', userCredential);
        },
        error: (error: FirebaseError) => {
          console.warn('Error:', error);
        },
      });
  }

  logout() {
    from(signOut(this.auth)).pipe(take(1)).subscribe();
  }

  forgotPassword() {
    console.warn(this.forgotPasswordForm.value);
    const value = this.forgotPasswordForm.value;
    from(sendPasswordResetEmail(this.auth, value.email!))
      .pipe(take(1))
      .subscribe({
        next: () => {
          console.info('email sent.');
        },
        error: (error: FirebaseError) => {
          console.warn('Error:', error);
        },
      });
  }
}
