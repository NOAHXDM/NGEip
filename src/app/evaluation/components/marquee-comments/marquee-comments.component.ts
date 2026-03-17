/**
 * MarqueeCommentsComponent（T027）
 *
 * CSS @keyframes translateX 跑馬燈元件
 *
 * 功能：
 *  - 顯示整體評語跑馬燈（匿名，不含評核者資訊）
 *  - 空陣列時 @if 不渲染
 *  - 動畫速度依文字總長度動態計算
 */

import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-marquee-comments',
  standalone: true,
  imports: [],
  template: `
    @if (comments && comments.length > 0) {
      <div class="marquee-wrapper" aria-live="polite" aria-label="整體評語跑馬燈">
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
    }

    .marquee-track {
      display: flex;
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

  /** 跑馬燈速度（像素/秒） */
  @Input() speedPx: number = 80;

  /** 評語之間的分隔符 */
  private readonly separator = '　|　';

  /** 合併後的文字 */
  get joinedText(): string {
    return this.comments.join(this.separator);
  }

  /**
   * 動畫時長（依文字總長度動態計算）
   * - 最短 10 秒
   * - 公式：Math.max(10, totalChars / speedPx * 8) 秒
   */
  get duration(): string {
    const totalChars = this.comments.join(this.separator).length;
    const seconds = Math.max(10, (totalChars / this.speedPx) * 8);
    return `${seconds}s`;
  }
}
