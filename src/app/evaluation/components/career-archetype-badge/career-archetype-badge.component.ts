/**
 * CareerArchetypeBadgeComponent（T028）
 *
 * 職業原型標籤元件
 *
 * 功能：
 *  - 接受 archetypes: string[]（含 emoji + 中文名稱）
 *  - 並列時以 / 分隔顯示多個原型
 *  - 使用 Angular Material Chip 樣式
 */

import { Component, Input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-career-archetype-badge',
  standalone: true,
  imports: [MatChipsModule],
  template: `
    @if (archetypes && archetypes.length > 0) {
      <div class="archetype-container">
        @if (archetypes.length === 1) {
          <!-- 單一原型 -->
          <mat-chip class="archetype-chip single">
            {{ archetypes[0] }}
          </mat-chip>
        } @else {
          <!-- 多個並列原型：以 / 分隔 -->
          <mat-chip class="archetype-chip parallel">
            {{ archetypes.join(' / ') }}
          </mat-chip>
        }
      </div>
    } @else {
      <span class="archetype-empty">尚未判定職業原型</span>
    }
  `,
  styles: [`
    :host {
      display: inline-block;
    }

    .archetype-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .archetype-chip {
      font-size: 14px;
      font-weight: 500;
      height: auto !important;
      padding: 4px 12px !important;
      white-space: normal !important;
    }

    .archetype-chip.single {
      background-color: #E8F0FE;
      color: #1A73E8;
    }

    .archetype-chip.parallel {
      background-color: #FEF3E2;
      color: #E37400;
    }

    .archetype-empty {
      font-size: 13px;
      color: #999;
      font-style: italic;
    }
  `],
})
export class CareerArchetypeBadgeComponent {
  @Input() archetypes: string[] = [];
}
