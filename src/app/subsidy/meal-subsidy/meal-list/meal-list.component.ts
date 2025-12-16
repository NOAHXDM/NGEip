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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';
import { Router } from '@angular/router';
import { map, Observable } from 'rxjs';

import {
  DailyMealRecord,
  MealSubsidyService,
} from '../../../services/meal-subsidy.service';
import { UserService } from '../../../services/user.service';
import { FirestoreTimestampPipe } from '../../../pipes/firestore-timestamp.pipe';
import { UserNamePipe } from '../../../pipes/user-name.pipe';
import { MealDailyFormComponent } from '../meal-daily-form/meal-daily-form.component';

@Component({
  selector: 'app-meal-list',
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
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    FirestoreTimestampPipe,
    UserNamePipe,
  ],
  templateUrl: './meal-list.component.html',
  styleUrl: './meal-list.component.scss',
  providers: [provideNativeDateAdapter()],
})
export class MealListComponent {
  readonly mealService = inject(MealSubsidyService);
  readonly userService = inject(UserService);
  readonly dialog = inject(MatDialog);
  readonly snackBar = inject(MatSnackBar);
  readonly router = inject(Router);

  readonly isAdmin$ = this.userService.isAdmin$;

  @ViewChild(MatSort) sort?: MatSort;

  // 日期範圍表單
  dateRangeForm = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  displayedColumns: string[] = [
    'date',
    'dayOfWeek',
    'mealCount',
    'dailyTotal',
    'actions',
  ];

  mealRecordsList$?: Observable<MatTableDataSource<DailyMealRecord>>;

  ngOnInit() {
    // 預設載入當月餐點記錄
    this.loadCurrentMonthMeals();
  }

  onDateRangeChange() {
    const start = this.dateRangeForm.value.start;
    const end = this.dateRangeForm.value.end;

    if (start && end) {
      this.loadMealsByDateRange(start, end);
    }
  }

  loadCurrentMonthMeals() {
    this.mealRecordsList$ = this.mealService.getCurrentMonthMeals().pipe(
      map((data) => this.transformToDataSource(data))
    );
  }

  loadCurrentWeekMeals() {
    this.mealRecordsList$ = this.mealService.getCurrentWeekMeals().pipe(
      map((data) => this.transformToDataSource(data))
    );
  }

  loadMealsByDateRange(startDate: Date, endDate: Date) {
    this.mealRecordsList$ = this.mealService
      .searchByDateRange(startDate, endDate)
      .pipe(map((data) => this.transformToDataSource(data)));
  }

  transformToDataSource(
    data: DailyMealRecord[]
  ): MatTableDataSource<DailyMealRecord> {
    const dataSource = new MatTableDataSource(data);
    dataSource.sort = this.sort!;
    return dataSource;
  }

  openNewMealDialog() {
    const dialogRef = this.dialog.open(MealDailyFormComponent, {
      data: { title: 'New Daily Meal Record' },
      width: '800px',
    });

    dialogRef.afterClosed().subscribe({
      next: (message) => {
        if (message) {
          this.openSnackBar(message);
        }
      },
    });
  }

  openEditMealDialog(record: DailyMealRecord) {
    const dialogRef = this.dialog.open(MealDailyFormComponent, {
      data: { title: 'Edit Daily Meal Record', record },
      width: '800px',
    });

    dialogRef.afterClosed().subscribe({
      next: (message) => {
        if (message) {
          this.openSnackBar(message);
        }
      },
    });
  }

  navigateToUserStats() {
    this.router.navigate(['/Subsidy/Meals/MyStats']);
  }

  getDayOfWeekName(dayOfWeek: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek] || '';
  }

  openSnackBar(message: string) {
    this.snackBar.open(message, 'Close', {
      horizontalPosition: 'center',
      verticalPosition: 'top',
      duration: 5000,
    });
  }
}
