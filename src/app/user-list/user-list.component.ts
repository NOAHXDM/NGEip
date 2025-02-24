import { Component } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { User, UserService } from '../services/user.service';
import { Observable, take } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import {
  animate,
  state,
  style,
  transition,
  trigger,
} from '@angular/animations';
import { FieldValue, Timestamp } from '@angular/fire/firestore';
export interface PeriodicElement {
  Name: string;
  Email: string;
  jobTitle: string;
  JobRank: string;
  remoteWorkEligibility: 'N/A' | 'WFH2' | 'WFH4.5';
  remoteWorkRecommender: string[];
  remainingLeaveHours: number;
  startDate?: Timestamp | FieldValue;
}
/**
 * @title Basic use of `<table mat-table>`tieef
 */
@Component({
  selector: 'app-user-list',
  styleUrl: './user-list.component.scss',
  templateUrl: './user-list.component.html',
  standalone: true,
  imports: [MatTableModule, MatIconModule],
  animations: [
    trigger('detailExpand', [
      state('collapsed,void', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition(
        'expanded <=> collapsed',
        animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')
      ),
    ]),
  ],
})
export class UserListComponent {
  list$: Observable<User[]>;
  userArray: User[] = [];
  displayedColumns: string[] = [
    'name',
    'email',
    'jobTitle',
    'jobRank',
    'remoteWorkEligibility',
    'expand',
  ];
  dataSource = this.userArray;

  columnsToDisplay = ['name', 'email', 'jobTitle', 'remainingLeaveHours'];
  expandedDetail = ['expandedDetail'];
  expandedElement?: PeriodicElement;
  constructor(private userService: UserService) {
    this.list$ = this.userService.list$;
  }
  ngOnInit() {
    this.profile();
  }
  profile() {
    this.list$.pipe(take(1)).subscribe({
      next: (A) => {
        this.userArray = A;
        console.log(A);
        A.forEach((B) => {
          if (B.startDate instanceof Timestamp) {
            const formattedDate = B.startDate.toDate().toLocaleDateString();
            console.log(`User: ${B.name}, 入職日: ${formattedDate}`);
          } else {
            console.log(`User: ${B.name}, 入職日: N/A`);
          }
        });
      },
    });
  }

  formatDate(startDate: any) {
    if (startDate instanceof Timestamp) {
      return startDate.toDate().toLocaleDateString();
    }
    return 'N/A';
  }
}
