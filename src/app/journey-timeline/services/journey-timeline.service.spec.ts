import { Timestamp } from '@angular/fire/firestore';

import { JourneyTimelineItem } from '../models/journey-timeline.models';
import { compareTimelineItems, JourneyTimelineSession, loadTimelinePageFromBuffers } from './journey-timeline.service';

function item(
  source: 'event' | 'subsidy',
  sourceId: string,
  millis: number
): JourneyTimelineItem {
  return {
    source,
    sourceId,
    occurredAt: Timestamp.fromMillis(millis),
    title: sourceId,
    attachments: [],
  };
}

describe('compareTimelineItems', () => {
  it('依時間由近到遠排序', () => {
    const values = [item('event', 'old', 1), item('event', 'new', 2)];
    expect(values.sort(compareTimelineItems).map((value) => value.sourceId)).toEqual(['new', 'old']);
  });

  it('同時間事件優先於補助', () => {
    const values = [item('subsidy', 's', 1), item('event', 'e', 1)];
    expect(values.sort(compareTimelineItems).map((value) => value.source)).toEqual(['event', 'subsidy']);
  });

  it('同來源同時間依文件 ID 降冪', () => {
    const values = [item('event', 'a', 1), item('event', 'z', 1)];
    expect(values.sort(compareTimelineItems).map((value) => value.sourceId)).toEqual(['z', 'a']);
  });
});

describe('loadTimelinePageFromBuffers', () => {
  function session(events: JourneyTimelineItem[], subsidies: JourneyTimelineItem[]): JourneyTimelineSession {
    return {
      userId: 'u1',
      events: { buffer: events, done: true },
      subsidies: { buffer: subsidies, done: true },
    };
  }

  it('以共同排序規則輸出跨來源頁面並保留未輸出的 buffer', async () => {
    const values = session(
      Array.from({ length: 12 }, (_, index) => item('event', `e-${index}`, 1_000 - index)),
      Array.from({ length: 12 }, (_, index) => item('subsidy', `s-${index}`, 900 - index))
    );

    const page = await loadTimelinePageFromBuffers(values, async () => undefined, async () => undefined);

    expect(page.items.length).toBe(20);
    expect(page.items[0].sourceId).toBe('e-0');
    expect(page.items.at(-1)?.sourceId).toBe('s-7');
    expect(values.subsidies.buffer.map((value) => value.sourceId)).toEqual(['s-8', 's-9', 's-10', 's-11']);
    expect(page.hasMore).toBeTrue();
  });

  it('buffer 空且來源尚未結束時會呼叫補資料函式', async () => {
    const values = session([], []);
    values.events.done = false;
    let fetchCount = 0;

    const page = await loadTimelinePageFromBuffers(
      values,
      async () => {
        if (values.events.done) return;
        fetchCount++;
        values.events.buffer.push(item('event', 'fetched', 100));
        values.events.done = true;
      },
      async () => undefined
    );

    expect(fetchCount).toBe(1);
    expect(page.items.map((value) => value.sourceId)).toEqual(['fetched']);
    expect(page.hasMore).toBeFalse();
  });

  it('兩來源都耗盡且無 buffer 時回報沒有更多資料', async () => {
    const page = await loadTimelinePageFromBuffers(session([], []), async () => undefined, async () => undefined);

    expect(page.items).toEqual([]);
    expect(page.hasMore).toBeFalse();
  });
});
