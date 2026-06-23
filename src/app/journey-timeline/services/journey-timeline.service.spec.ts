import { Timestamp } from '@angular/fire/firestore';

import { JourneyTimelineItem } from '../models/journey-timeline.models';
import { compareTimelineItems } from './journey-timeline.service';

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

