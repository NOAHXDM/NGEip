# Angular 介面契約

```ts
export type JourneyTimelineSource = 'event' | 'subsidy';

export interface UserJourneyEvent {
  id: string;
  targetUserId: string;
  eventDate: Timestamp;
  title: string;
  content: string;
  attachments: AttachmentMetadata[];
  createdBy: string;
  createdAt: Timestamp;
  updatedBy: string;
  updatedAt: Timestamp;
  lastAuditId: string;
  deleteAuditId: string;
}

export interface JourneyTimelineItem {
  source: JourneyTimelineSource;
  sourceId: string;
  occurredAt: Timestamp;
  title: string;
  content?: string;
  subsidyType?: SubsidyType;
  status?: SubsidyStatus;
  requestedAmount?: number;
  approvedAmount?: number;
  attachments: AttachmentMetadata[];
}

export interface TimelinePage {
  items: JourneyTimelineItem[];
  hasMore: boolean;
}

export interface JourneyEventDialogData {
  targetUserId: string;
  actorUid: string;
  event?: UserJourneyEvent;
  permissions: JourneyEventPermissions;
}

export interface JourneyEventPermissions {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}
```

## 元件輸入

```ts
@Input({ required: true }) userId!: string;
@Input({ required: true }) eventPermissions!: JourneyEventPermissions;
```

`eventPermissions` 只影響 UI；service 與 Firebase Rules 不可信任此值作授權。個人報告傳入 `{ canCreate: false, canUpdate: false, canDelete: false }`；Admin 嵌入報告傳入三項皆 `true`。
