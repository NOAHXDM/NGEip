import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { Component, inject, Inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { Observable } from 'rxjs';

import { SubsidyStatsService, UserRanking } from '../../services/subsidy-stats.service';
import { SubsidyType } from '../../services/subsidy.service';
import { SubsidyTypePipe } from '../../pipes/subsidy-type.pipe';
import { UserNamePipe } from '../../pipes/user-name.pipe';

export interface RankingDialogData {
  type: 'laptop' | 'healthCheck' | 'training' | 'aiTool' | 'travel' | 'meal';
  year: number;
}

@Component({
  selector: 'app-subsidy-ranking-dialog',
  standalone: true,
  imports: [
    AsyncPipe,
    CurrencyPipe,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    SubsidyTypePipe,
    UserNamePipe,
  ],
  templateUrl: './subsidy-ranking-dialog.component.html',
  styleUrl: './subsidy-ranking-dialog.component.scss',
})
export class SubsidyRankingDialogComponent {
  readonly statsService = inject(SubsidyStatsService);

  rankings$: Observable<UserRanking[]>;
  displayedColumns: string[] = ['rank', 'userId', 'count', 'totalAmount'];

  title: string;
  countLabel: string;

  constructor(@Inject(MAT_DIALOG_DATA) public data: RankingDialogData) {
    // 根據類型設定標題和標籤
    this.title = this.getTitle(data.type);
    this.countLabel = data.type === 'meal' ? 'Meal Count' : 'Count';

    // 獲取完整排行資料
    this.rankings$ = this.getRankings(data.type, data.year);
  }

  private getTitle(type: string): string {
    const titles: Record<string, string> = {
      laptop: 'Laptop Subsidy Rankings',
      healthCheck: 'Health Check Subsidy Rankings',
      training: 'Training Course Subsidy Rankings',
      aiTool: 'AI Tool Subsidy Rankings',
      travel: 'Travel Subsidy Rankings',
      meal: 'Meal Subsidy Rankings',
    };
    return titles[type] || 'Rankings';
  }

  private getRankings(type: string, year: number): Observable<UserRanking[]> {
    const typeMap: Record<string, SubsidyType> = {
      laptop: SubsidyType.Laptop,
      healthCheck: SubsidyType.HealthCheck,
      training: SubsidyType.Training,
      aiTool: SubsidyType.AITool,
      travel: SubsidyType.Travel,
    };

    if (type === 'meal') {
      return this.statsService.getTopUsersByMeal(year, 999);
    } else {
      const subsidyType = typeMap[type];
      return this.statsService.getTopUsersByType(subsidyType, year, 999);
    }
  }
}
