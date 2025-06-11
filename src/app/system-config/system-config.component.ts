import { Component, inject } from '@angular/core';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  MatSnackBar,
  MatSnackBarVerticalPosition,
} from '@angular/material/snack-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, take } from 'rxjs';

import { AttendanceService } from '../services/attendance.service';
import { SystemConfigService } from '../services/system-config.service';
import { UserService } from '../services/user.service';
@Component({
  selector: 'app-system-config',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
    ReactiveFormsModule,
  ],
  templateUrl: './system-config.component.html',
  styleUrl: './system-config.component.scss',
})
export class SystemConfigComponent {
  publicIds: string[] = [];
  readonly isAdmin$: Observable<boolean>;

  readonly attendanceService = inject(AttendanceService);
  readonly reasonPriorityList = this.attendanceService.reasonPriorityList;
  configForm = new FormGroup({
    currentUsers: new FormControl(0, [Validators.min(0)]),
    maxUsers: new FormControl(1, [Validators.required, Validators.min(1)]),
    lastUpdated: new FormControl(''),
    initialSettlementYear: new FormControl(0, [Validators.required]),
    timeFilterRange: new FormControl(false),
    overtimePriorityReplacedByLeave: new FormArray(
      this.reasonPriorityList.map(() => new FormControl(false))
    ),
    cloudinaryCloudName: new FormControl(),
    cloudinaryUploadPreset: new FormControl(),
  });

  constructor(
    private systemConfigService: SystemConfigService,
    private _snackBar: MatSnackBar,
    private userService: UserService
  ) {
    this.isAdmin$ = this.userService.isAdmin$;
    this.systemConfigService.license$.pipe(takeUntilDestroyed()).subscribe({
      next: (license) => {
        const model = {
          ...license,
          overtimePriorityReplacedByLeave: this.reasonPriorityList.map(
            (reasonPriority) =>
              license.overtimePriorityReplacedByLeave.includes(
                reasonPriority.value
              )
          ),
        };
        this.configForm.patchValue(model as any);
      },
    });
    this.configForm.get('currentUsers')?.disable();
    this.configForm.get('lastUpdated')?.disable();
  }

  updateLicense() {
    const {
      maxUsers,
      initialSettlementYear,
      timeFilterRange,
      cloudinaryCloudName,
      cloudinaryUploadPreset,
    } = this.configForm.value;

    const overtimePriorityReplacedByLeave =
      this.configForm.value.overtimePriorityReplacedByLeave
        ?.map((checked, idx) => {
          if (checked) {
            return this.reasonPriorityList[idx].value;
          }

          return undefined;
        })
        .filter((checked) => checked !== undefined);

    this.systemConfigService
      .updateLicense(
        maxUsers!,
        initialSettlementYear!,
        timeFilterRange!,
        overtimePriorityReplacedByLeave!,
        cloudinaryCloudName!,
        cloudinaryUploadPreset!
      )
      .pipe(take(1))
      .subscribe({
        next: () => this.openSnackBar('License updated successfully'),
      });
  }
  openSnackBar(
    message: string,
    verticalPosition: MatSnackBarVerticalPosition = 'top'
  ) {
    this._snackBar.open(message, 'Close', {
      horizontalPosition: 'center',
      verticalPosition: verticalPosition,
      duration: 5000,
    });
  }

  downloadUsersPhotoPublicId() {
    this.userService.list$.pipe(take(1)).subscribe({
      next: (users) => {
        this.publicIds = users
          .filter((user) => !!user.photoUrl)
          .map((user) => {
            const photoUrl = user.photoUrl;
            const photoUrlSplit = photoUrl!.split('/');
            const photoPublicIdFile = photoUrlSplit.pop()!.split('.');
            const [photoPublicId] = photoPublicIdFile;
            return photoPublicId;
          });
      },
    });
    const JSONData = JSON.stringify(this.publicIds);
    const blob = new Blob([JSONData], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'eipImages';
    link.click();
    URL.revokeObjectURL(link.href);
  }
}
