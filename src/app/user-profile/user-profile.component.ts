import { AsyncPipe, NgIf, NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, Inject, Optional, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MtxDatetimepickerModule } from '@ng-matero/extensions/datetimepicker';
import { provideDateFnsDatetimeAdapter } from '@ng-matero/extensions-date-fns-adapter';
import { Timestamp } from '@angular/fire/firestore';

import { startOfDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Observable, take } from 'rxjs';

import { User, UserService } from '../services/user.service';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [
    NgIf,
    NgTemplateOutlet,
    AsyncPipe,
    ReactiveFormsModule,
    MatBadgeModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTabsModule,
    MtxDatetimepickerModule,
  ],
  providers: [
    provideDateFnsDatetimeAdapter({
      parse: {
        dateInput: 'yyyy-MM-dd',
        monthInput: 'MMMM',
        yearInput: 'yyyy',
        timeInput: 'HH:mm:ss',
        datetimeInput: 'yyyy-MM-dd HH:mm:ss',
      },
      display: {
        dateInput: 'yyyy-MM-dd',
        monthInput: 'MMMM',
        yearInput: 'yyyy',
        timeInput: 'HH:mm:ss',
        datetimeInput: 'yyyy-MM-dd HH:mm:ss',
        monthYearLabel: 'yyyy MMMM',
        dateA11yLabel: 'PP',
        monthYearA11yLabel: 'MMMM yyyy',
        popupHeaderDateLabel: 'MMM dd, EEE',
      },
    }),
    { provide: MAT_DATE_LOCALE, useValue: enUS },
  ],
  templateUrl: './user-profile.component.html',
  styleUrl: './user-profile.component.scss',
})
export class UserProfileComponent {
  profileForm = new FormGroup({
    birthday: new FormControl(''),
    name: new FormControl('', [Validators.required]),
    phone: new FormControl(''),
    // photo: new FormControl(''),
    remoteWorkEligibility: new FormControl('N/A'),
    remoteWorkRecommender: new FormControl<string[]>([]),
    uid: new FormControl('', [Validators.required]),
  });
  advancedForm = new FormGroup({
    jobRank: new FormControl(''),
    jobTitle: new FormControl(''),
    role: new FormControl('user'),
    startDate: new FormControl(''),
    uid: new FormControl('', [Validators.required]),
  });
  readonly remoteWorkEligibilityOptions = ['N/A', 'WFH2', 'WFH4.5'];
  readonly roleOptions = ['user', 'admin'];
  readonly isAdmin$: Observable<boolean>;
  readonly userList$: Observable<User[]>;
  readonly remainingLeaveHours = signal(0);

  constructor(
    private userService: UserService,
    private _snackBar: MatSnackBar,
    @Optional() @Inject(MAT_DIALOG_DATA) protected data: any
  ) {
    this.isAdmin$ = this.userService.isAdmin$; // TODO: Need to renender the html to show the admin options
    this.userList$ = this.userService.list$ as Observable<User[]>;
    this.userService.currentUser$.pipe(takeUntilDestroyed()).subscribe({
      next: (user) => {
        let value: any = { ...user };
        if (user.birthday) {
          value.birthday = (user.birthday as Timestamp).toDate();
        }

        if (user.startDate) {
          value.startDate = (user.startDate as Timestamp).toDate();
        }

        this.profileForm.patchValue(value);
        this.advancedForm.patchValue(value);
        this.remainingLeaveHours.set(user.remainingLeaveHours);
      },
    });
  }

  normalFieldsUpdate() {
    const data: any = this.profileForm.value;
    if (data.birthday) {
      data.birthday = Timestamp.fromDate(startOfDay(data.birthday));
    }

    this.userService
      .updateUser(data)
      .pipe(take(1))
      .subscribe({
        next: () => this.openSnackBar('Profile updated successfully.'),
      });
  }

  advancedFieldsUpdate() {
    const data: any = this.advancedForm.value;
    if (data.startDate) {
      data.startDate = Timestamp.fromDate(startOfDay(data.startDate));
    }

    this.userService
      .updateUserAdvanced(data)
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

  openLeaveTransactionHistoryDialog() {
    this.openSnackBar('Coming soon');
  }

  openLeaveTransactionDialog() {
    console.log('openLeaveTransactionDialog');
  }
}
