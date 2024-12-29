import { Component, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';

import { UserService } from '../services/user.service';
import { take } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  protected userService = inject(UserService);
  private _snackBar = inject(MatSnackBar);
  private _router = inject(Router);
  loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required]),
  });

  login() {
    const { email, password } = this.loginForm.value;

    this.userService
      .login(email!, password!)
      .pipe(take(1))
      .subscribe({
        next: () => this._router.navigate(['/']),
        error: (error) => this.openSnackBar(error.message),
      });
  }
  openSnackBar(message: string) {
    this._snackBar.open(message, 'Close', {
      horizontalPosition: 'center',
      verticalPosition: 'top',
      duration: 5000,
    });
  }
}
