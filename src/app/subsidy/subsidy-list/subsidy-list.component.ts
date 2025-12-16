import { AsyncPipe } from '@angular/common';
import { Component, ViewChild, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';
import { map, Observable } from 'rxjs';

import {
  SubsidyApplication,
  SubsidyService,
  SubsidyType,
} from '../../services/subsidy.service';
import { UserService } from '../../services/user.service';
import { SubsidyTypePipe } from '../../pipes/subsidy-type.pipe';
import { SubsidyStatusPipe } from '../../pipes/subsidy-status.pipe';
import { FirestoreTimestampPipe } from '../../pipes/firestore-timestamp.pipe';
import { UserNamePipe } from '../../pipes/user-name.pipe';
import { SubsidyApplicationComponent } from '../subsidy-application/subsidy-application.component';
import { SubsidyStatusChangeComponent } from '../subsidy-status-change/subsidy-status-change.component';
import { SubsidyHistoryComponent } from '../subsidy-history/subsidy-history.component';
import { LaptopInstallmentDialogComponent } from '../laptop-installment-dialog/laptop-installment-dialog.component';

@Component({
  selector: 'app-subsidy-list',
  standalone: true,
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatMenuModule,
    MatSnackBarModule,
    MatSortModule,
    MatTableModule,
    MatTabsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    SubsidyTypePipe,
    SubsidyStatusPipe,
    FirestoreTimestampPipe,
    UserNamePipe,
  ],
  templateUrl: './subsidy-list.component.html',
  styleUrl: './subsidy-list.component.scss',
  providers: [provideNativeDateAdapter()],
})
export class SubsidyListComponent {
  readonly subsidyService = inject(SubsidyService);
  readonly userService = inject(UserService);
  readonly dialog = inject(MatDialog);
  readonly snackBar = inject(MatSnackBar);

  readonly currentUser$ = this.userService.currentUser$;
  readonly isAdmin$ = this.userService.isAdmin$;

  @ViewChild(MatSort) sort?: MatSort;

  selectedTabIndex = 0;
  selectedType: SubsidyType | null = null;
  typeList = this.subsidyService.typeList;

  // 日期範圍表單
  dateRangeForm = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  displayedColumns: string[] = [
    'status',
    'type',
    'userId',
    'applicationDate',
    'content',
    'invoiceAmount',
    'approvedAmount',
    'actions',
  ];

  allApplicationsList$?: Observable<MatTableDataSource<SubsidyApplication>>;
  myApplicationsList$?: Observable<MatTableDataSource<SubsidyApplication>>;
  pendingApplicationsList$?: Observable<MatTableDataSource<SubsidyApplication>>;

  ngOnInit() {
    // 預設載入當月所有申請
    this.loadAllApplications();

    this.currentUser$.subscribe((user) => {
      if (user && user.uid) {
        this.loadMyApplications(user.uid);
      }
    });

    this.isAdmin$.subscribe((isAdmin) => {
      if (isAdmin) {
        this.loadPendingApplications();
      }
    });
  }

  onTabChange(index: number) {
    this.selectedTabIndex = index;
  }

  onTypeFilterChange(type: SubsidyType | null) {
    this.selectedType = type;

    // 根據當前 Tab 重新載入資料
    if (this.selectedTabIndex === 0) {
      // 全部申請 Tab
      const start = this.dateRangeForm.value.start;
      const end = this.dateRangeForm.value.end;
      this.loadAllApplications(start || undefined, end || undefined);
    } else if (this.selectedTabIndex === 1) {
      // 我的申請 Tab
      this.currentUser$.subscribe((user) => {
        if (user && user.uid) {
          this.loadMyApplications(user.uid);
        }
      });
    }
  }

  onDateRangeChange() {
    const start = this.dateRangeForm.value.start;
    const end = this.dateRangeForm.value.end;

    if (start && end) {
      this.loadAllApplications(start, end);
    }
  }

  loadAllApplications(startDate?: Date, endDate?: Date) {
    let observable: Observable<SubsidyApplication[]>;

    if (startDate && endDate) {
      // 使用指定的日期範圍
      observable = this.subsidyService.searchByTypeAndDate(
        this.selectedType,
        startDate,
        endDate
      );
    } else {
      // 預設顯示當月
      observable = this.subsidyService.getCurrentMonthApplications();
    }

    this.allApplicationsList$ = observable.pipe(
      map((data) => this.transformToDataSource(data))
    );
  }

  loadMyApplications(userId: string) {
    const observable =
      this.selectedType !== null
        ? this.subsidyService.getMyApplicationsByType(userId, this.selectedType)
        : this.subsidyService.getMyApplications(userId);

    this.myApplicationsList$ = observable.pipe(
      map((data) => this.transformToDataSource(data))
    );
  }

  loadPendingApplications() {
    this.pendingApplicationsList$ = this.subsidyService
      .getPendingApplications()
      .pipe(map((data) => this.transformToDataSource(data)));
  }

  transformToDataSource(
    data: SubsidyApplication[]
  ): MatTableDataSource<SubsidyApplication> {
    const dataSource = new MatTableDataSource(data);
    dataSource.sort = this.sort!;
    return dataSource;
  }

  openNewApplicationDialog() {
    const dialogRef = this.dialog.open(SubsidyApplicationComponent, {
      data: { title: 'New Subsidy Application' },
      width: '600px',
    });

    dialogRef.afterClosed().subscribe({
      next: (message) => {
        if (message) {
          this.openSnackBar(message);
        }
      },
    });
  }

  openEditApplicationDialog(application: SubsidyApplication) {
    const dialogRef = this.dialog.open(SubsidyApplicationComponent, {
      data: { title: 'Edit Subsidy Application', application },
      width: '600px',
    });

    dialogRef.afterClosed().subscribe({
      next: (message) => {
        if (message) {
          this.openSnackBar(message);
        }
      },
    });
  }

  openStatusChangeDialog(
    application: SubsidyApplication,
    newStatus: 'approved' | 'rejected'
  ) {
    const dialogRef = this.dialog.open(SubsidyStatusChangeComponent, {
      data: { application, newStatus },
      width: '65vw',
      maxWidth: '400px',
    });

    dialogRef.afterClosed().subscribe({
      next: (message) => {
        if (message) {
          this.openSnackBar(message);
        }
      },
    });
  }

  openHistoryDialog(application: SubsidyApplication) {
    this.dialog.open(SubsidyHistoryComponent, {
      data: { id: application.id },
      width: '700px',
    });
  }

  openInstallmentDialog(application: SubsidyApplication) {
    this.dialog.open(LaptopInstallmentDialogComponent, {
      data: { application },
      width: '800px',
    });
  }

  openSnackBar(message: string) {
    this.snackBar.open(message, 'Close', {
      horizontalPosition: 'center',
      verticalPosition: 'top',
      duration: 5000,
    });
  }
}
