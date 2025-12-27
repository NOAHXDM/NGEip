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
import { map, Observable, take } from 'rxjs';

import {
  SubsidyApplication,
  SubsidyService,
  SubsidyType,
} from '../../services/subsidy.service';
import { UserService } from '../../services/user.service';
import { SubsidyTypePipe } from '../../pipes/subsidy-type.pipe';
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
  showFilterPanel = false; // 控制浮動過濾器面板的顯示/隱藏

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
    // 切換 Tab 時應用當前的過濾條件
    this.applyFilters();
  }

  onTypeFilterChange(type: SubsidyType | null) {
    this.selectedType = type;
    this.applyFilters();
  }

  onDateRangeChange() {
    this.applyFilters();
  }

  toggleFilterPanel() {
    this.showFilterPanel = !this.showFilterPanel;
  }

  clearFilters() {
    this.dateRangeForm.reset();
    this.selectedType = null;
    this.applyFilters();
  }

  /**
   * 根據當前的過濾條件重新載入資料
   */
  private applyFilters() {
    const start = this.dateRangeForm.value.start;
    const end = this.dateRangeForm.value.end;

    // 根據當前 Tab 重新載入資料
    if (this.selectedTabIndex === 0) {
      // 全部申請 Tab
      this.loadAllApplications(start || undefined, end || undefined);
    } else if (this.selectedTabIndex === 1) {
      // 我的申請 Tab
      this.currentUser$.pipe(take(1)).subscribe((user) => {
        if (user && user.uid) {
          this.loadMyApplications(user.uid, start || undefined, end || undefined);
        }
      });
    } else if (this.selectedTabIndex === 2) {
      // 待審核 Tab
      this.loadPendingApplications(start || undefined, end || undefined);
    }
  }

  loadAllApplications(startDate?: Date, endDate?: Date) {
    let observable: Observable<SubsidyApplication[]>;

    if (startDate && endDate) {
      // 有日期範圍：使用日期範圍查詢（會同時考慮類型過濾）
      observable = this.subsidyService.searchByTypeAndDate(
        this.selectedType,
        startDate,
        endDate
      );
    } else if (this.selectedType !== null) {
      // 只有類型過濾，沒有日期範圍：使用當月資料並過濾類型
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      observable = this.subsidyService.searchByTypeAndDate(
        this.selectedType,
        startOfMonth,
        startOfNextMonth
      );
    } else {
      // 沒有任何過濾：顯示當月所有資料
      observable = this.subsidyService.getCurrentMonthApplications();
    }

    this.allApplicationsList$ = observable.pipe(
      map((data) => this.transformToDataSource(data))
    );
  }

  loadMyApplications(userId: string, startDate?: Date, endDate?: Date) {
    let observable: Observable<SubsidyApplication[]>;

    if (startDate && endDate) {
      // 有日期範圍：先取得所有我的申請，然後在客戶端過濾
      observable = this.subsidyService.getMyApplications(userId).pipe(
        map((applications) => {
          return applications.filter((app) => {
            const appDate = (app.applicationDate as any).toDate();
            const matchesDate = appDate >= startDate && appDate < endDate;
            const matchesType = this.selectedType === null || app.type === this.selectedType;
            return matchesDate && matchesType;
          });
        })
      );
    } else if (this.selectedType !== null) {
      // 只有類型過濾
      observable = this.subsidyService.getMyApplicationsByType(userId, this.selectedType);
    } else {
      // 沒有任何過濾
      observable = this.subsidyService.getMyApplications(userId);
    }

    this.myApplicationsList$ = observable.pipe(
      map((data) => this.transformToDataSource(data))
    );
  }

  loadPendingApplications(startDate?: Date, endDate?: Date) {
    let observable: Observable<SubsidyApplication[]>;

    if (startDate && endDate) {
      // 有日期範圍：先取得所有待審核申請，然後在客戶端過濾
      observable = this.subsidyService.getPendingApplications().pipe(
        map((applications) => {
          return applications.filter((app) => {
            const appDate = (app.applicationDate as any).toDate();
            const matchesDate = appDate >= startDate && appDate < endDate;
            const matchesType = this.selectedType === null || app.type === this.selectedType;
            return matchesDate && matchesType;
          });
        })
      );
    } else if (this.selectedType !== null) {
      // 只有類型過濾：先取得所有待審核申請，然後在客戶端過濾類型
      observable = this.subsidyService.getPendingApplications().pipe(
        map((applications) => {
          return applications.filter((app) => app.type === this.selectedType);
        })
      );
    } else {
      // 沒有任何過濾：顯示所有待審核申請
      observable = this.subsidyService.getPendingApplications();
    }

    this.pendingApplicationsList$ = observable.pipe(
      map((data) => this.transformToDataSource(data))
    );
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
