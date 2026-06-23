import { Injectable, inject } from '@angular/core';
import {
  DocumentData,
  DocumentSnapshot,
  Firestore,
  QueryConstraint,
  Timestamp,
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from '@angular/fire/firestore';

import { SubsidyApplication, SubsidyType } from '../../services/subsidy.service';
import {
  JourneyTimelineItem,
  TimelinePage,
  UserJourneyEvent,
} from '../models/journey-timeline.models';

const SOURCE_PAGE_SIZE = 20;
const OUTPUT_PAGE_SIZE = 20;

interface SourceState {
  buffer: JourneyTimelineItem[];
  cursor?: DocumentSnapshot<DocumentData>;
  done: boolean;
}

export interface JourneyTimelineSession {
  userId: string;
  events: SourceState;
  subsidies: SourceState;
}

const SUBSIDY_TITLES: Record<SubsidyType, string> = {
  [SubsidyType.Laptop]: '筆電補助',
  [SubsidyType.HealthCheck]: '健康檢查',
  [SubsidyType.Training]: '訓練課程',
  [SubsidyType.AITool]: 'AI 工具',
  [SubsidyType.Travel]: '旅遊補助',
};

export function compareTimelineItems(a: JourneyTimelineItem, b: JourneyTimelineItem): number {
  const timeDiff = b.occurredAt.toMillis() - a.occurredAt.toMillis();
  if (timeDiff) return timeDiff;
  if (a.source !== b.source) return a.source === 'event' ? -1 : 1;
  return b.sourceId.localeCompare(a.sourceId);
}

export async function loadTimelinePageFromBuffers(
  session: JourneyTimelineSession,
  ensureEventBuffer: () => Promise<void>,
  ensureSubsidyBuffer: () => Promise<void>
): Promise<TimelinePage> {
  const items: JourneyTimelineItem[] = [];
  while (items.length < OUTPUT_PAGE_SIZE) {
    await Promise.all([
      ensureEventBuffer(),
      ensureSubsidyBuffer(),
    ]);
    const event = session.events.buffer[0];
    const subsidy = session.subsidies.buffer[0];
    if (!event && !subsidy) break;
    if (event && (!subsidy || compareTimelineItems(event, subsidy) <= 0)) {
      items.push(session.events.buffer.shift()!);
    } else {
      items.push(session.subsidies.buffer.shift()!);
    }
  }
  return {
    items,
    hasMore: !!session.events.buffer.length || !!session.subsidies.buffer.length
      || !session.events.done || !session.subsidies.done,
  };
}

@Injectable({ providedIn: 'root' })
export class JourneyTimelineService {
  private readonly firestore = inject(Firestore);

  createSession(userId: string): JourneyTimelineSession {
    return {
      userId,
      events: { buffer: [], done: false },
      subsidies: { buffer: [], done: false },
    };
  }

  async loadNext(session: JourneyTimelineSession): Promise<TimelinePage> {
    return loadTimelinePageFromBuffers(
      session,
      () => this.ensureEventBuffer(session),
      () => this.ensureSubsidyBuffer(session)
    );
  }

  private async ensureEventBuffer(session: JourneyTimelineSession): Promise<void> {
    if (session.events.buffer.length || session.events.done) return;
    const constraints: QueryConstraint[] = [
      where('targetUserId', '==', session.userId),
      orderBy('eventDate', 'desc'),
      orderBy(documentId(), 'desc'),
      ...(session.events.cursor ? [startAfter(session.events.cursor)] : []),
      limit(SOURCE_PAGE_SIZE),
    ];
    const snapshot = await getDocs(query(collection(this.firestore, 'userJourneyEvents'), ...constraints));
    session.events.cursor = snapshot.docs.at(-1);
    session.events.done = snapshot.size < SOURCE_PAGE_SIZE;
    session.events.buffer.push(...snapshot.docs.map((item) => {
      const event = { id: item.id, ...item.data() } as UserJourneyEvent;
      return {
        source: 'event' as const,
        sourceId: item.id,
        occurredAt: event.eventDate,
        title: event.title,
        content: event.content,
        attachments: event.attachments ?? [],
        event,
      };
    }));
  }

  private async ensureSubsidyBuffer(session: JourneyTimelineSession): Promise<void> {
    if (session.subsidies.buffer.length || session.subsidies.done) return;
    const constraints: QueryConstraint[] = [
      where('userId', '==', session.userId),
      orderBy('applicationDate', 'desc'),
      orderBy(documentId(), 'desc'),
      ...(session.subsidies.cursor ? [startAfter(session.subsidies.cursor)] : []),
      limit(SOURCE_PAGE_SIZE),
    ];
    const snapshot = await getDocs(query(collection(this.firestore, 'subsidyApplications'), ...constraints));
    session.subsidies.cursor = snapshot.docs.at(-1);
    session.subsidies.done = snapshot.size < SOURCE_PAGE_SIZE;
    session.subsidies.buffer.push(...snapshot.docs.map((item) => {
      const subsidy = { id: item.id, ...item.data() } as SubsidyApplication;
      return {
        source: 'subsidy' as const,
        sourceId: item.id,
        occurredAt: subsidy.applicationDate as Timestamp,
        title: SUBSIDY_TITLES[subsidy.type] ?? '補助申請',
        content: subsidy.content,
        subsidyType: subsidy.type,
        status: subsidy.status,
        requestedAmount: subsidy.invoiceAmount,
        approvedAmount: subsidy.approvedAmount,
        attachments: subsidy.attachments ?? [],
      };
    }));
  }
}
