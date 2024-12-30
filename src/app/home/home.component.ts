import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';

import { take } from 'rxjs';

import { UserService } from '../services/user.service';
import { AttendanceComponent } from '../attendance/attendance.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatGridListModule,
    MatIconModule,
    MatMenuModule,
    MatToolbarModule,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  constructor(
    private userService: UserService,
    private _router: Router,
    private _dialog: MatDialog
  ) {}

  logout() {
    this.userService
      .logout()
      .pipe(take(1))
      .subscribe({
        next: () => this._router.navigate(['/Login']),
        error: (error) => {},
      });
  }

  openNewAttendanceDialog() {
    const dialogRef = this._dialog.open(AttendanceComponent, {
      data: { title: 'Create a new request' },
    });

    dialogRef.afterClosed().subscribe({
      next: (result) => {
        console.log(result);
      },
    });
  }
}
