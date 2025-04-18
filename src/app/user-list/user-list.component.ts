import { Component, inject } from '@angular/core';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { AsyncPipe } from '@angular/common';

import { UserNamePipe } from '../pipes/user-name.pipe';
import { FirestoreTimestampPipe } from '../pipes/firestore-timestamp.pipe';
import { User, UserService } from '../services/user.service';
import { UserProfileComponent } from '../user-profile/user-profile.component';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-user-list',
  styleUrl: './user-list.component.scss',
  templateUrl: './user-list.component.html',
  standalone: true,
  imports: [
    AsyncPipe,
    FirestoreTimestampPipe,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatTableModule,
    UserNamePipe,
    MatSortModule,
  ],
})
export class UserListComponent {
  displayedColumns: string[] = [
    'name',
    'startDate',
    'jobTitle',
    'jobRank',
    'remoteWorkEligibility',
    'remainingLeaveHours',
    'contactInfo',
    'birthday',
    'exitDate',
    'actions',
  ];
  userService = inject(UserService);
  _dialog = inject(MatDialog);
  list$ = this.userService.list$;
  isAdmin$ = this.userService.isAdmin$;
  dataSource = new MatTableDataSource();
  @ViewChild(MatSort) sort?: MatSort;

  constructor() {
    this.list$ = this.userService.list$;
    this.list$.pipe(takeUntilDestroyed()).subscribe({
      next: (userList) => (this.dataSource.data = userList),
    });
  }

  ngAfterViewInit() {
    if (this.sort) {
      this.dataSource.sort = this.sort;
    }
  }

  openUserProfileDialog(user: User) {
    const dialogRef = this._dialog.open(UserProfileComponent, {
      data: { user },
      width: '65vw',
    });
  }
}
