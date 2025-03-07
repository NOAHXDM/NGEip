import { Component } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { User, UserService } from '../services/user.service';
import { Observable, take } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { Timestamp } from '@angular/fire/firestore';
import { UserNamePipe } from '../pipes/user-name.pipe';
import { FirestoreTimestampPipe } from '../pipes/firestore-timestamp.pipe';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
export interface PeriodicElement {
  Name: string;
  Email: string;
  jobTitle: string;
  JobRank: string;
  remoteWorkEligibility: 'N/A' | 'WFH2' | 'WFH4.5';
  remoteWorkRecommender: string[] /*背書人*/;
  startDate?: Timestamp;
  birthday?: Timestamp;
  exitDate?: Timestamp;
  uid: string;
  remainingLeaveHours: number;
}
@Component({
  selector: 'app-user-list',
  styleUrl: './user-list.component.scss',
  templateUrl: './user-list.component.html',
  standalone: true,
  imports: [
    MatTableModule,
    MatIconModule,
    UserNamePipe,
    FirestoreTimestampPipe,
    CommonModule,
    MatChipsModule,
  ],
})
export class UserListComponent {
  list$: Observable<User[]>;
  userArray: User[] = [];

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
  ngOnInit() {
    this.profile();
  }
  profile() {
    this.list$.pipe(take(1)).subscribe({
      next: (userList) => {
        this.userArray = userList;
        console.log(userList);
      },
    });
  }

  showStarDate(startDate: any) {
    if (startDate instanceof Timestamp) {
      return startDate.toDate().toLocaleDateString();
    }
    return 'N/A';
  }
  showBirthday(birthday: any) {
    if (birthday instanceof Timestamp) {
      return birthday.toDate().toLocaleDateString();
    }
    return '未輸入';
  }

  showQuitDate(exitDate: any) {
    if (exitDate instanceof Timestamp) {
      return exitDate.toDate().toLocaleDateString();
    }
    return '在職中';
  }
}
