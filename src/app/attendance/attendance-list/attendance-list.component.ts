import { AsyncPipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ViewChild,
  ElementRef,
  inject,
} from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import {
  MatChipListbox,
  MatChipSelectionChange,
  MatChipsModule,
} from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { map, Observable } from 'rxjs';

import {
  AttendanceLog,
  AttendanceService,
} from '../../services/attendance.service';
import { AttendanceComponent } from '../attendance.component';
import { AttendanceTypePipe } from '../../pipes/attendance-type.pipe';
import { FirestoreTimestampPipe } from '../../pipes/firestore-timestamp.pipe';
import { ReasonPriorityPipe } from '../../pipes/reason-priority.pipe';
import { UserNamePipe } from '../../pipes/user-name.pipe';
import { AttendanceStatusChangeComponent } from '../attendance-status-change/attendance-status-change.component';
import { AttendanceHistoryComponent } from '../attendance-history/attendance-history.component';
import { AttendanceFilterRequesterComponent } from '../attendance-filter-requester/attendance-filter-requester.component';
import { ClientPreferencesService } from '../../services/client-preferences.service';

@Component({
  selector: 'app-attendance-list',
  standalone: true,
  imports: [
    AsyncPipe,
    MatBadgeModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatMenuModule,
    MatSnackBarModule,
    MatSortModule,
    MatTableModule,
    AttendanceTypePipe,
    FirestoreTimestampPipe,
    ReasonPriorityPipe,
    UserNamePipe,
  ],
  templateUrl: './attendance-list.component.html',
  styleUrl: './attendance-list.component.scss',
  providers: [UserNamePipe],
})
export class AttendanceListComponent implements AfterViewInit {
  readonly userNamePipe = inject(UserNamePipe);
  _attendanceList?: MatTableDataSource<any>;
  attendanceList$?: Observable<MatTableDataSource<any>>;
  displayedColumns: string[] = [
    'status',
    'userId',
    'type',
    'startDateTime',
    'endDateTime',
    'hours',
    'reason',
    'reasonPriority',
    'proxyUserId',
    'callout',
    'history',
  ];

  @ViewChild(MatSort) sort?: MatSort;
  @ViewChild(MatChipListbox) chipList?: MatChipListbox;
  logsSearchOption: string;
  @ViewChild('cardHeader', { static: false, read: ElementRef })
  cardHeader!: ElementRef;
  filterRequesterSet: Set<string>;

  constructor(
    private attendanceService: AttendanceService,
    private clientPreferencesService: ClientPreferencesService,
    private _dialog: MatDialog,
    private _snackBar: MatSnackBar
  ) {
    this.logsSearchOption =
      this.clientPreferencesService.getPreference('logsSearchOption') || '0';
    this.filterRequesterSet = new Set(
      JSON.parse(
        this.clientPreferencesService.getPreference('filterRequesters') || '[]'
      )
    );
  }

  ngAfterViewInit() {
    // Set the position of the header text to absolute
    // To fab-button and chip-list to be displayed correctly
    const headerText = this.cardHeader.nativeElement.querySelector(
      '.mat-mdc-card-header-text'
    );
    headerText.style.position = 'absolute';

    this.chipList?.chipSelectionChanges.subscribe({
      next: (change: MatChipSelectionChange) => {
        if (change.selected) {
          this.dateRangeChange(change.source.value);
        }
      },
    });
  }

  dateRangeChange(option: string) {
    // Save the selected option to the client preferences
    this.logsSearchOption = option;
    this.clientPreferencesService.setPreference(
      'logsSearchOption',
      this.logsSearchOption
    );
    // Load the attendance list based on the selected option
    switch (option) {
      case '0':
        this.attendanceList$ = this.attendanceService.getCurrentDay.pipe(
          map((data) => this.transformToDataSource(data))
        );
        break;
      case '1':
        this.attendanceList$ = this.attendanceService.getCurrentWeek.pipe(
          map((data) => this.transformToDataSource(data))
        );
        break;
      case '2':
        this.attendanceList$ = this.attendanceService.getCurrentMonth.pipe(
          map((data) => this.transformToDataSource(data))
        );
        break;
      case '3':
        this.attendanceList$ = this.attendanceService.getPreviousMonth.pipe(
          map((data) => this.transformToDataSource(data))
        );
        break;
      default:
        break;
    }
  }

  transformToDataSource(data: any[]): MatTableDataSource<any> {
    this._attendanceList = new MatTableDataSource(data);
    this._attendanceList.sort = this.sort!;
    this._attendanceList.filterPredicate = (
      data: AttendanceLog,
      filter: string
    ) => {
      const filters = new Set(JSON.parse(filter));
      if (filters.size === 0) return true;
      return filters.has(this.userNamePipe.transform(data.userId));
    };
    this.applyFilter();
    return this._attendanceList;
  }

  openNewAttendanceDialog() {
    const dialogRef = this._dialog.open(AttendanceComponent, {
      data: { title: 'Create a new request' },
      width: '65vw',
    });

    dialogRef.afterClosed().subscribe({
      next: (result) => {
        if (result) {
          this.openSnackBar('Request created successfully');
        }
      },
    });
  }

  openEditAttendanceDialog(attendance: AttendanceLog) {
    const dialogRef = this._dialog.open(AttendanceComponent, {
      data: { title: 'Edit request', attendance },
      width: '65vw',
    });

    dialogRef.afterClosed().subscribe({
      next: (message) => {
        if (message) {
          this.openSnackBar(message);
        }
      },
    });
  }

  openAttendanceStatusChangeDialog(
    attendance: AttendanceLog,
    newStatus: string
  ) {
    const dialogRef = this._dialog.open(AttendanceStatusChangeComponent, {
      data: { attendance, newStatus },
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

  openAttendanceHistoryDialog(attendance: AttendanceLog) {
    const dialogRef = this._dialog.open(AttendanceHistoryComponent, {
      data: { id: attendance.id },
      width: '65vw',
      maxWidth: '400px',
    });

    dialogRef.afterClosed().subscribe({
      next: () => {},
    });
  }

  openFilterDialog() {
    const dialogRef = this._dialog.open(AttendanceFilterRequesterComponent, {
      data: { requesters: Array.from(this.filterRequesterSet) },
      width: '50vw',
      maxWidth: '400px',
    });

    dialogRef.afterClosed().subscribe({
      next: (filterRequesterResult: string[]) => {
        this.filterRequesterSet = new Set(filterRequesterResult);
        this.applyFilter();
      },
    });
  }

  applyFilter() {
    this._attendanceList!.filter = JSON.stringify([...this.filterRequesterSet]);
  }

  openSnackBar(message: string) {
    this._snackBar.open(message, 'Close', {
      horizontalPosition: 'center',
      verticalPosition: 'top',
      duration: 5000,
    });
  }
}
