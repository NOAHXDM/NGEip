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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { take } from 'rxjs';

import { SystemConfigService } from '../services/system-config.service';
import { UserService } from '../services/user.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private systemConfigService = inject(SystemConfigService);
  private userService = inject(UserService);
  private _snackBar = inject(MatSnackBar);
  private _router = inject(Router);
  inProgress = false;
  registerForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required]),
  });

  register() {
    const { license } = this.systemConfigService;
    if (!license) {
      this.openSnackBar(
        'Your license has not been activated yet. Please activate it to continue.'
      );
      return;
    }

    this.inProgress = true;
    const { email, password } = this.registerForm.value;
    this.userService
      .createUser(email!, password!)
      .pipe(take(1))
      .subscribe({
        next: () => this._router.navigate(['/']),
        error: (error) => this.openSnackBar(error.message),
        complete: () => (this.inProgress = false),
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
