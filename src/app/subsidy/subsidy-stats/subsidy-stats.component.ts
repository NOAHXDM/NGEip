import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { map, Observable, switchMap } from 'rxjs';

import { SubsidyStatsService, UserTotalSubsidy, SystemSubsidySummary, SystemMealStats, AllTopUsers } from '../../services/subsidy-stats.service';
import { UserService } from '../../services/user.service';
import { SubsidyTypePipe } from '../../pipes/subsidy-type.pipe';
import { UserNamePipe } from '../../pipes/user-name.pipe';
import { SubsidyRankingDialogComponent, RankingDialogData } from '../subsidy-ranking-dialog/subsidy-ranking-dialog.component';

@Component({
  selector: 'app-subsidy-stats',
  standalone: true,
  imports: [
    AsyncPipe,
    CurrencyPipe,
    MatCardModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTableModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    SubsidyTypePipe,
    UserNamePipe,
  ],
  templateUrl: './subsidy-stats.component.html',
  styleUrl: './subsidy-stats.component.scss',
})
export class SubsidyStatsComponent {
  readonly statsService = inject(SubsidyStatsService);
  readonly userService = inject(UserService);
  readonly dialog = inject(MatDialog);

  readonly currentUser$ = this.userService.currentUser$;
  readonly isAdmin$ = this.userService.isAdmin$;

  // 年度選擇器
  currentYear = new Date().getFullYear();
  selectedYear = signal(this.currentYear);
  yearOptions = Array.from({ length: 5 }, (_, i) => this.currentYear - i);

  // 個人統計資料
  userStats$: Observable<UserTotalSubsidy | null>;

  // 系統統計資料
  systemSubsidyStats$: Observable<SystemSubsidySummary>;
  systemMealStats$: Observable<SystemMealStats[]>;
  topUsers$: Observable<AllTopUsers>;

  // 表格欄位
  subsidyTypeColumns = ['type', 'count', 'totalAmount', 'userCount'];
  mealMonthColumns = ['yearMonth', 'userCount', 'totalMealCount', 'totalAmount', 'averagePerUser'];
  rankingColumns = ['rank', 'userId', 'count', 'totalAmount'];

  constructor() {
    // 監聽年度變更，重新載入個人統計
    this.userStats$ = this.currentUser$.pipe(
      switchMap((user) => {
        if (!user || !user.uid) return [null];
        return this.statsService.getUserTotalSubsidy(user.uid, this.selectedYear());
      })
    );

    // 監聽年度變更，重新載入系統統計
    this.systemSubsidyStats$ = this.statsService.getSystemAllSubsidyStats(this.selectedYear());
    this.systemMealStats$ = this.statsService.getSystemMealStatsByYear(this.selectedYear());
    this.topUsers$ = this.statsService.getAllTopUsers(this.selectedYear());
  }

  /**
   * 年度變更處理
   */
  onYearChange(year: number) {
    this.selectedYear.set(year);

    // 重新載入個人統計
    this.userStats$ = this.currentUser$.pipe(
      switchMap((user) => {
        if (!user || !user.uid) return [null];
        return this.statsService.getUserTotalSubsidy(user.uid, year);
      })
    );

    // 重新載入系統統計
    this.systemSubsidyStats$ = this.statsService.getSystemAllSubsidyStats(year);
    this.systemMealStats$ = this.statsService.getSystemMealStatsByYear(year);
    this.topUsers$ = this.statsService.getAllTopUsers(year);
  }

  /**
   * 計算餐費年度總計
   */
  calculateMealYearTotal(stats: SystemMealStats[]): number {
    return stats.reduce((sum, s) => sum + s.totalAmount, 0);
  }

  /**
   * 計算餐費年度平均
   */
  calculateMealYearAverage(stats: SystemMealStats[]): number {
    const monthsWithData = stats.filter(s => s.userCount > 0);
    if (monthsWithData.length === 0) return 0;
    const totalAverage = monthsWithData.reduce((sum, s) => sum + s.averagePerUser, 0);
    return totalAverage / monthsWithData.length;
  }

  /**
   * 打開完整排行榜 Dialog
   */
  openRankingDialog(type: RankingDialogData['type']) {
    this.dialog.open(SubsidyRankingDialogComponent, {
      width: '700px',
      data: {
        type,
        year: this.selectedYear(),
      } as RankingDialogData,
    });
  }
}
