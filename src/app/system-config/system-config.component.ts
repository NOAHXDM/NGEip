import { Component } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { SystemConfigService } from '../services/system-config.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  MatSnackBar,
  MatSnackBarVerticalPosition,
} from '@angular/material/snack-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@Component({
  selector: 'app-system-config',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule,
  ],
  templateUrl: './system-config.component.html',
  styleUrl: './system-config.component.scss',
})
export class SystemConfigComponent {
  configForm = new FormGroup({
    currentUsers: new FormControl(0, [Validators.min(0)]),
    maxUsers: new FormControl(1, [Validators.required, Validators.min(1)]),
    lastUpdated: new FormControl(''),
    initialSettlementYear: new FormControl(0, [Validators.required]),
    customRange: new FormControl(),
  });

  constructor(
    private systemConfigService: SystemConfigService,
    private _snackBar: MatSnackBar
  ) {
    this.systemConfigService.license$.pipe(takeUntilDestroyed()).subscribe({
      next: (license) => {
        this.configForm.patchValue(license as any);
      },
    });
    this.configForm.get('currentUsers')?.disable();
    this.configForm.get('lastUpdated')?.disable();
  }

  updateLicense() {
    const { maxUsers, initialSettlementYear, customRange } =
      this.configForm.value;

    this.systemConfigService
      .updateLicense(maxUsers!, initialSettlementYear!, customRange!)
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
}
