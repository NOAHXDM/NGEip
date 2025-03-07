import { Component } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { AsyncPipe } from '@angular/common';
import { Observable } from 'rxjs';

import { UserNamePipe } from '../pipes/user-name.pipe';
import { FirestoreTimestampPipe } from '../pipes/firestore-timestamp.pipe';
import { User, UserService } from '../services/user.service';

@Component({
  selector: 'app-user-list',
  styleUrl: './user-list.component.scss',
  templateUrl: './user-list.component.html',
  standalone: true,
  imports: [
    AsyncPipe,
    FirestoreTimestampPipe,
    MatChipsModule,
    MatIconModule,
    MatTableModule,
    UserNamePipe,
  ],
})
export class UserListComponent {
  list$: Observable<User[]>;
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
  ];

  constructor(private userService: UserService) {
    this.list$ = this.userService.list$;
  }
}
