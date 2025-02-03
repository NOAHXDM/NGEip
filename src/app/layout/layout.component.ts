import { AsyncPipe } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import {
  MatSnackBar,
  MatSnackBarModule,
  MatSnackBarVerticalPosition,
} from '@angular/material/snack-bar';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Observable, take } from 'rxjs';

import { AttendanceStatsService } from '../services/attendance-stats.service';
import { UserService } from '../services/user.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    AsyncPipe,
    RouterLink,
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSnackBarModule,
    MatToolbarModule,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  readonly isAdmin$: Observable<boolean>;

  constructor(
    private attendanceStatsService: AttendanceStatsService,
    private userService: UserService,
    private _router: Router,
    private _snackBar: MatSnackBar
  ) {
    this.isAdmin$ = this.userService.isAdmin$;
  }

  logout() {
    this.userService
      .logout()
      .pipe(take(1))
      .subscribe({
        next: () => this._router.navigate(['/Login']),
        error: (error) => {},
      });
  }

  // deprecated
  settlement() {
    this.attendanceStatsService
      .updateAttendanceStatsMonthly()
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.openSnackBar('Settlement completed successfully');
        },
        error: (error) => {},
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
