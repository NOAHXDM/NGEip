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
    this.countLabel = data.type === 'meal' ? '餐數' : '筆數';

    // 獲取完整排行資料
    this.rankings$ = this.getRankings(data.type, data.year);
  }

  private getTitle(type: string): string {
    const titles: Record<string, string> = {
      laptop: '筆電補助排行榜',
      healthCheck: '健康檢查補助排行榜',
      training: '訓練課程補助排行榜',
      aiTool: 'AI 工具補助排行榜',
      travel: '差旅補助排行榜',
      meal: '餐費補助排行榜',
    };
    return titles[type] || '排行榜';
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
