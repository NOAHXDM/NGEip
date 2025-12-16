import { AsyncPipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Observable, switchMap, map, of } from 'rxjs';

import {
  UserMealStats,
  MealSubsidyService,
} from '../../../services/meal-subsidy.service';
import { UserService } from '../../../services/user.service';
import { MonthDetailsDialogComponent } from '../month-details-dialog/month-details-dialog.component';

@Component({
  selector: 'app-user-meal-stats',
  standalone: true,
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTableModule,
  ],
  templateUrl: './user-meal-stats.component.html',
  styleUrl: './user-meal-stats.component.scss',
})
export class UserMealStatsComponent implements OnInit {
  readonly mealService = inject(MealSubsidyService);
  readonly userService = inject(UserService);
  readonly dialog = inject(MatDialog);
  readonly router = inject(Router);

  readonly currentUser$ = this.userService.currentUser$;

  yearForm = new FormGroup({
    year: new FormControl(new Date().getFullYear()),
  });

  displayedColumns: string[] = [
    'yearMonth',
    'mealCount',
    'totalAmount',
    'actions',
  ];

  yearlyStats$?: Observable<MatTableDataSource<UserMealStats>>;
  yearlyTotal = 0;
  yearlyMealCount = 0;

  ngOnInit() {
    this.loadStats(this.yearForm.value.year || new Date().getFullYear());

    // 監聽年份變更
    this.yearForm.get('year')?.valueChanges.subscribe((value) => {
      this.loadStats(value!);
    });
  }

  loadStats(year: number) {
    this.yearlyStats$ = this.currentUser$.pipe(
      switchMap((user) => {
        if (!user?.uid) {
          return of([]);
        }
        return this.mealService.getUserYearlyStats(user.uid, year);
      }),
      map((stats) => {
        // 計算年度總計
        this.yearlyTotal = stats.reduce(
          (sum, stat) => sum + stat.totalAmount,
          0
        );
        this.yearlyMealCount = stats.reduce(
          (sum, stat) => sum + stat.mealCount,
          0
        );

        return new MatTableDataSource(stats);
      })
    );
  }

  openMonthDetails(stats: UserMealStats) {
    this.dialog.open(MonthDetailsDialogComponent, {
      data: { stats },
      width: '600px',
    });
  }

  navigateToMealList() {
    this.router.navigate(['/Subsidy/Meals']);
  }

  getYearOptions(): number[] {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let i = currentYear; i >= currentYear - 5; i--) {
      years.push(i);
    }
    return years;
  }
}
