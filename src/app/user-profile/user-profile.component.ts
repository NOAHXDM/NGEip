import { AsyncPipe, NgIf, NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, Inject, Optional, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule, MatSnackBarVerticalPosition } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MtxDatetimepickerModule } from '@ng-matero/extensions/datetimepicker';
import { provideDateFnsDatetimeAdapter } from '@ng-matero/extensions-date-fns-adapter';
import { Timestamp } from '@angular/fire/firestore';

import { startOfDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { map, Observable, switchMap, take, tap } from 'rxjs';

import { User, UserService } from '../services/user.service';
import { UserNamePipe } from '../pipes/user-name.pipe';
import { FirestoreTimestampPipe } from '../pipes/firestore-timestamp.pipe';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [
    NgIf,
    NgTemplateOutlet,
    AsyncPipe,
    UserNamePipe,
    FirestoreTimestampPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTableModule,
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
  remainingLeaveHoursForm = new FormGroup({
    actionBy: new FormControl('', [Validators.required]),
    hours: new FormControl('', [Validators.required]),
    reason: new FormControl('', [
      Validators.required,
      Validators.maxLength(400),
    ]),
    uid: new FormControl('', [Validators.required]),
  });
  readonly remoteWorkEligibilityOptions = ['N/A', 'WFH2', 'WFH4.5'];
  readonly roleOptions = ['user', 'admin'];
  readonly isAdmin$: Observable<boolean>;
  readonly userList$: Observable<User[]>;
  readonly remainingLeaveHours = signal(0);
  readonly leaveTransactionHistory$: Observable<MatTableDataSource<any>>;
  displayedColumns: string[] = ['date', 'hours', 'reason', 'actionBy'];
  title = '';

  constructor(
    private userService: UserService,
    private _snackBar: MatSnackBar,
    @Optional() @Inject(MAT_DIALOG_DATA) protected data: any
  ) {
    this.isAdmin$ = this.userService.isAdmin$;
    this.userList$ = (this.userService.list$ as Observable<User[]>).pipe(
      // Update remainingLeaveHours
      tap((userList) => {
        const matchUser = userList.find(
          (user) => user.uid == this.data?.user.uid
        );

        if (this.data && matchUser) {
          this.remainingLeaveHours.set(matchUser.remainingLeaveHours);
        }
      })
    );
    this.userService.currentUser$.pipe(takeUntilDestroyed()).subscribe({
      next: (user) => {
        // Dialog/My profile mode
        this.title = this.data ? 'User Profile' : 'My Profile';
        let value: any = this.data ? { ...this.data.user } : { ...user };

        if (value.birthday) {
          value.birthday = (value.birthday as Timestamp).toDate();
        }

        if (value.startDate) {
          value.startDate = (value.startDate as Timestamp).toDate();
        }

        this.profileForm.patchValue(value);
        this.advancedForm.patchValue(value);
        // Update remainingLeaveHours
        this.remainingLeaveHours.set(value.remainingLeaveHours);
        // Set uid for remainingLeaveHoursForm
        this.remainingLeaveHoursForm.get('uid')?.setValue(value.uid);
        // Set actionBy for leave transaction
        this.remainingLeaveHoursForm.get('actionBy')?.setValue(user.uid!);
      },
    });

    this.leaveTransactionHistory$ = this.userService.currentUser$.pipe(
      switchMap((user) =>
        this.userService.leaveTransactionHistory(
          this.data ? this.data.user.uid : user.uid!
        )
      ),
      map((data) => new MatTableDataSource(data))
    );
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

  openSnackBar(message: string, verticalPosition: MatSnackBarVerticalPosition = 'top') {
    this._snackBar.open(message, 'Close', {
      horizontalPosition: 'center',
      verticalPosition: verticalPosition,
      duration: 5000,
    });
  }

  leaveTransaction() {
    const data: any = this.remainingLeaveHoursForm.value;

    this.userService
      .updateRemainingLeaveHours(data)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.remainingLeaveHoursForm.get('hours')?.reset();
          this.remainingLeaveHoursForm.get('reason')?.reset();
          this.openSnackBar('Leave transaction updated successfully.', 'bottom');
        },
      });
  }
}
