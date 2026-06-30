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
const SOURCE_FETCH_LIMIT = SOURCE_PAGE_SIZE + 1;
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
  inFlightPromise?: Promise<TimelinePage>;
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
  return b.sourceId < a.sourceId ? -1 : b.sourceId > a.sourceId ? 1 : 0;
}

export function takeTimelineSourcePage<T>(
  docs: readonly T[],
  pageSize = SOURCE_PAGE_SIZE
): { docs: readonly T[]; cursor?: T; done: boolean } {
  const visibleDocs = docs.slice(0, pageSize);
  return {
    docs: visibleDocs,
    cursor: visibleDocs.at(-1),
    done: docs.length <= pageSize,
  };
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
    if (session.inFlightPromise) return session.inFlightPromise;
    const promise = loadTimelinePageFromBuffers(
      session,
      () => this.ensureEventBuffer(session),
      () => this.ensureSubsidyBuffer(session)
    ).finally(() => {
      if (session.inFlightPromise === promise) delete session.inFlightPromise;
    });
    session.inFlightPromise = promise;
    return promise;
  }

  private async ensureEventBuffer(session: JourneyTimelineSession): Promise<void> {
    if (session.events.buffer.length || session.events.done) return;
    const constraints: QueryConstraint[] = [
      where('targetUserId', '==', session.userId),
      orderBy('eventDate', 'desc'),
      orderBy(documentId(), 'desc'),
      ...(session.events.cursor ? [startAfter(session.events.cursor)] : []),
      limit(SOURCE_FETCH_LIMIT),
    ];
    const snapshot = await getDocs(query(collection(this.firestore, 'userJourneyEvents'), ...constraints));
    const page = takeTimelineSourcePage(snapshot.docs);
    session.events.cursor = page.cursor;
    session.events.done = page.done;
    session.events.buffer.push(...page.docs.map((item) => {
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
      limit(SOURCE_FETCH_LIMIT),
    ];
    const snapshot = await getDocs(query(collection(this.firestore, 'subsidyApplications'), ...constraints));
    const page = takeTimelineSourcePage(snapshot.docs);
    session.subsidies.cursor = page.cursor;
    session.subsidies.done = page.done;
    session.subsidies.buffer.push(...page.docs.map((item) => {
      const subsidy = { id: item.id, ...item.data() } as SubsidyApplication;
      return {
        source: 'subsidy' as const,
        sourceId: item.id,
        occurredAt: subsidy.applicationDate as Timestamp,
        title: SUBSIDY_TITLES[subsidy.type] ?? '補助申請',
        content: subsidy.content,
        subsidyType: subsidy.type,
        status: subsidy.status,
        invoiceAmount: subsidy.invoiceAmount,
        approvedAmount: subsidy.approvedAmount,
        attachments: subsidy.attachments ?? [],
      };
    }));
  }
}
