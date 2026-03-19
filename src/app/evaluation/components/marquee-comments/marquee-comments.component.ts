/**
 * MarqueeCommentsComponent（T027）
 *
 * CSS @keyframes translateX 跑馬燈元件
 *
 * 功能：
 *  - 顯示整體評語跑馬燈（匿名，不含評核者資訊）
 *  - 空陣列時 @if 不渲染
 *  - 動畫速度依文字總長度動態計算（以像素寬度估算，保持恆定滾動速率）
 *  - hover 暫停動畫
 *  - 點擊開啟彈窗顯示完整評語
 */

import { Component, Input, inject } from '@angular/core';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-marquee-comments',
  standalone: true,
  imports: [MatDialogModule],
  template: `
    @if (comments && comments.length > 0) {
      <div
        class="marquee-wrapper"
        aria-live="polite"
        aria-label="整體評語跑馬燈，點擊查看完整內容"
        role="button"
        tabindex="0"
        (click)="openFullContent()"
        (keydown.enter)="openFullContent()"
        title="點擊查看完整評語">
        <div
          class="marquee-track"
          [style.animation-duration]="duration">
          <span class="marquee-text">{{ joinedText }}</span>
          <!-- 複製一份讓跑馬燈無縫循環 -->
          <span class="marquee-text" aria-hidden="true">{{ joinedText }}</span>
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      overflow: hidden;
    }

    .marquee-wrapper {
      width: 100%;
      overflow: hidden;
      background-color: #f5f5f5;
      border-radius: 4px;
      padding: 8px 0;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .marquee-wrapper:hover {
      background-color: #ebebeb;
    }

    .marquee-wrapper:hover .marquee-track {
      animation-play-state: paused;
    }

    .marquee-track {
      display: inline-flex;
      white-space: nowrap;
      animation: marquee-scroll linear infinite;
      will-change: transform;
    }

    .marquee-text {
      flex-shrink: 0;
      padding: 0 16px;
      font-size: 14px;
      color: #444;
      line-height: 1.5;
    }

    @keyframes marquee-scroll {
      0% {
        transform: translateX(0);
      }
      100% {
        transform: translateX(-50%);
      }
    }
  `],
})
export class MarqueeCommentsComponent {
  @Input() comments: string[] = [];

  /**
   * 跑馬燈滾動速度（像素/秒）
   * 預設 120 px/s，約每秒滾過 8–9 個中文字，適合一般閱讀速率
   */
  @Input() speedPx: number = 120;

  private readonly dialog = inject(MatDialog);

  /** 評語之間的分隔符 */
  private readonly separator = '　|　';

  /** 中文字元預估寬度（font-size 14px） */
  private readonly charWidthPx = 14;

  /** 合併後的文字 */
  get joinedText(): string {
    return this.comments.join(this.separator);
  }

  /**
   * 動畫時長（依文字像素寬度與目標速率計算）
   * - 最短 8 秒
   * - 公式：estimatedPixelWidth / speedPx 秒
   */
  get duration(): string {
    const totalChars = this.joinedText.length;
    const estimatedPixelWidth = totalChars * this.charWidthPx;
    const seconds = Math.max(8, estimatedPixelWidth / this.speedPx);
    return `${seconds}s`;
  }

  /** 點擊開啟完整評語彈窗 */
  openFullContent(): void {
    this.dialog.open(MarqueeCommentsDialogComponent, {
      data: { comments: this.comments },
      width: '90vw',
      maxWidth: '600px',
      maxHeight: '80vh',
    });
  }
}

// ── 完整評語彈窗 ──────────────────────────────────────────────────────────────

@Component({
  selector: 'app-marquee-comments-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="dialog-title-icon">format_quote</mat-icon>
      整體評語
    </h2>
    <mat-dialog-content>
      <div class="comments-list">
        @for (comment of data.comments; track $index) {
          <div class="comment-item">
            <span class="comment-index">{{ $index + 1 }}</span>
            <p class="comment-text">{{ comment }}</p>
          </div>
          @if (!$last) {
            <hr class="comment-divider" />
          }
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>關閉</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-title-icon {
      vertical-align: middle;
      margin-right: 4px;
      color: #888;
    }

    .comments-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .comment-item {
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }

    .comment-index {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background-color: #e8eaf6;
      color: #3f51b5;
      font-size: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;
    }

    .comment-text {
      margin: 0;
      font-size: 15px;
      line-height: 1.7;
      color: #333;
      word-break: break-word;
    }

    .comment-divider {
      border: none;
      border-top: 1px solid #eee;
      margin: 0;
    }
  `],
})
export class MarqueeCommentsDialogComponent {
  readonly data = inject<{ comments: string[] }>(MAT_DIALOG_DATA);
}
