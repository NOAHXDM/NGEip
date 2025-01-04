import { AsyncPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, Inject, Optional } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Observable, take } from 'rxjs';

import { User, UserService } from '../services/user.service';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: './user-profile.component.html',
  styleUrl: './user-profile.component.scss',
})
export class UserProfileComponent {
  profileForm = new FormGroup({
    // birthday: new FormControl(''),
    // jobRank: new FormControl(''),
    // jobTitle: new FormControl(''),
    name: new FormControl('', [Validators.required]),
    phone: new FormControl(''),
    // photo: new FormControl(''),
    remoteWorkEligibility: new FormControl('N/A'),
    remoteWorkRecommender: new FormControl<string[]>([]),
    role: new FormControl('user'),
    // startDate: new FormControl(''),
    uid: new FormControl('', [Validators.required]),
  });
  readonly remoteWorkEligibilityOptions = ['N/A', 'WFH2', 'WFH4.5'];
  readonly roleOptions = ['user', 'admin'];
  userList$: Observable<User[]>;

  constructor(
    private userService: UserService,
    private _snackBar: MatSnackBar,
    @Optional() @Inject(MAT_DIALOG_DATA) protected data: any
  ) {
    this.userList$ = this.userService.list$ as Observable<User[]>;
    this.userService.currentUser$.pipe(takeUntilDestroyed()).subscribe({
      next: (user) => {
        this.profileForm.patchValue(user as any);
      },
    });
  }

  update() {
    const data: any = this.profileForm.value;
    this.userService
      .updateUser(data)
      .pipe(take(1))
      .subscribe({
        next: () => this.openSnackBar('Profile updated successfully.'),
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
