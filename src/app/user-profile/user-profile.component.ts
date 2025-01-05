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
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
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
    AsyncPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
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
  readonly isAdmin$: Observable<boolean>;
  readonly userList$: Observable<User[]>;

  constructor(
    private userService: UserService,
    private _snackBar: MatSnackBar,
    @Optional() @Inject(MAT_DIALOG_DATA) protected data: any
  ) {
    this.isAdmin$ = this.userService.isAdmin$;  // TODO: Need to renender the html to show the admin options
    this.userList$ = this.userService.list$ as Observable<User[]>;
    this.userService.currentUser$.pipe(takeUntilDestroyed()).subscribe({
      next: (user) => {
        let value: any = { ...user };
        if (user.birthday) {
          value.birthday = startOfDay((user.birthday as Timestamp).toDate());
        }
        this.profileForm.patchValue(value);
      },
    });
  }

  update() {
    const data: any = this.profileForm.value;
    if (data.birthday) {
      data.birthday = Timestamp.fromDate(data.birthday);
    }
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
