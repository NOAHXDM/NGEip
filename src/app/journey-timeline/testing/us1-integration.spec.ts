import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch } from 'firebase/firestore';

import { SubsidyType } from '../../services/subsidy.service';
import { JourneyTimelineService } from '../services/journey-timeline.service';
import {
  JOURNEY_ADMIN_UID,
  JOURNEY_OTHER_UID,
  JOURNEY_TARGET_UID,
  journeyEventDoc,
  subsidyApplicationDoc,
  userDoc,
} from './journey-timeline-test-data';
import {
  authenticatedJourneyContext,
  clearJourneyTimelineData,
  initJourneyTimelineTestEnv,
  journeyIntegrationEnabled,
  teardownJourneyTimelineTestEnv,
} from './emulator-setup';

const describeIfIntegration = journeyIntegrationEnabled() ? describe : xdescribe;
const BASE_TARGET_TIMELINE_ITEM_COUNT = 5;
const LARGE_PAGE_DOCUMENT_COUNT_PER_SOURCE = 22;
const TIMELINE_SOURCE_COUNT = 2;
const LARGE_PAGE_TIMELINE_ITEM_COUNT = LARGE_PAGE_DOCUMENT_COUNT_PER_SOURCE * TIMELINE_SOURCE_COUNT;
const EXPECTED_LARGE_PAGE_TOTAL =
  BASE_TARGET_TIMELINE_ITEM_COUNT + LARGE_PAGE_TIMELINE_ITEM_COUNT;
const VIEWER_CASES = [
  { label: '目標使用者本人', uid: JOURNEY_TARGET_UID },
  { label: '其他已登入使用者', uid: JOURNEY_OTHER_UID },
  { label: '管理者', uid: JOURNEY_ADMIN_UID },
];

describeIfIntegration('US1 Angular 與 Firestore Emulator 整合測試', () => {
  let testEnv: RulesTestEnvironment;
  let originalTimeout: number;

  beforeAll(async () => {
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 30_000;
    testEnv = await initJourneyTimelineTestEnv();
  });

  afterAll(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    await teardownJourneyTimelineTestEnv();
  });

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await clearJourneyTimelineData();
    await seedTimelineData(testEnv);
  });

  for (const viewer of VIEWER_CASES) {
    it(`${viewer.label}只會載入指定目標使用者的時間軸`, async () => {
      const service = createServiceFor(viewer.uid);
      const session = service.createSession(JOURNEY_TARGET_UID);

      const page = await service.loadNext(session);

      expect(page.items.length)
        .withContext(`viewer: ${viewer.uid}`)
        .toBe(BASE_TARGET_TIMELINE_ITEM_COUNT);
      expect(page.items.map((item) => `${item.source}:${item.sourceId}`))
        .withContext(`viewer: ${viewer.uid}`)
        .toEqual([
          'event:target-event-new',
          'subsidy:target-subsidy-new',
          'event:target-event-same-time',
          'subsidy:target-subsidy-same-time',
          'subsidy:target-subsidy-training',
        ]);
      expect(page.items.every((item) => item.sourceId.startsWith('target-')))
        .withContext(`viewer: ${viewer.uid}`)
        .toBeTrue();
      expect(page.items.some((item) => item.sourceId.includes('other')))
        .withContext(`viewer: ${viewer.uid}`)
        .toBeFalse();
      expect(page.hasMore).withContext(`viewer: ${viewer.uid}`).toBeFalse();
    });
  }

  it('跨來源分頁合併保持完整且沒有重複項目', async () => {
    await seedLargeTimelinePage(testEnv);
    const service = createServiceFor(JOURNEY_TARGET_UID);
    const session = service.createSession(JOURNEY_TARGET_UID);
    const allIds: string[] = [];
    let hasMore = true;
    let iterations = 0;

    while (hasMore) {
      if (++iterations > 100) {
        throw new Error('時間軸分頁在 100 次迭代內未結束。');
      }
      const page = await service.loadNext(session);
      allIds.push(...page.items.map((item) => `${item.source}:${item.sourceId}`));
      hasMore = page.hasMore;
    }

    expect(allIds.length).toBe(EXPECTED_LARGE_PAGE_TOTAL);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds).toContain('event:page-event-00');
    expect(allIds).toContain('event:page-event-21');
    expect(allIds).toContain('subsidy:page-subsidy-00');
    expect(allIds).toContain('subsidy:page-subsidy-21');
    expect(allIds.some((id) => id.includes('other'))).toBeFalse();
  });

  function createServiceFor(uid: string): JourneyTimelineService {
    const firestore = authenticatedJourneyContext(uid).firestore();
    TestBed.configureTestingModule({
      providers: [
        JourneyTimelineService,
        { provide: Firestore, useValue: firestore },
      ],
    });
    return TestBed.inject(JourneyTimelineService);
  }
});

async function seedTimelineData(testEnv: RulesTestEnvironment): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, `users/${JOURNEY_TARGET_UID}`), userDoc(JOURNEY_TARGET_UID)),
      setDoc(doc(db, `users/${JOURNEY_OTHER_UID}`), userDoc(JOURNEY_OTHER_UID)),
      setDoc(doc(db, `users/${JOURNEY_ADMIN_UID}`), userDoc(JOURNEY_ADMIN_UID, 'admin')),
      setDoc(doc(db, 'userJourneyEvents/target-event-new'), journeyEventDoc('target-event-new', JOURNEY_TARGET_UID, 10)),
      setDoc(doc(db, 'userJourneyEvents/target-event-same-time'), journeyEventDoc('target-event-same-time', JOURNEY_TARGET_UID, 8)),
      setDoc(doc(db, 'userJourneyEvents/other-event-new'), journeyEventDoc('other-event-new', JOURNEY_OTHER_UID, 12)),
      setDoc(doc(db, 'subsidyApplications/target-subsidy-new'), subsidyApplicationDoc(JOURNEY_TARGET_UID, 9)),
      setDoc(doc(db, 'subsidyApplications/target-subsidy-same-time'), subsidyApplicationDoc(JOURNEY_TARGET_UID, 8, SubsidyType.Training, 'approved', 9)),
      setDoc(doc(db, 'subsidyApplications/target-subsidy-training'), subsidyApplicationDoc(JOURNEY_TARGET_UID, 7, SubsidyType.Training)),
      setDoc(doc(db, 'subsidyApplications/other-subsidy-new'), subsidyApplicationDoc(JOURNEY_OTHER_UID, 13)),
    ]);
  });
}

async function seedLargeTimelinePage(testEnv: RulesTestEnvironment): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = writeBatch(db);
    for (let index = 0; index < LARGE_PAGE_DOCUMENT_COUNT_PER_SOURCE; index++) {
      batch.set(
        doc(db, `userJourneyEvents/page-event-${index.toString().padStart(2, '0')}`),
        journeyEventDoc(`page-event-${index.toString().padStart(2, '0')}`, JOURNEY_TARGET_UID, 31 - index)
      );
      batch.set(
        doc(db, `subsidyApplications/page-subsidy-${index.toString().padStart(2, '0')}`),
        subsidyApplicationDoc(JOURNEY_TARGET_UID, 31 - index)
      );
    }
    await batch.commit();
  });
}
