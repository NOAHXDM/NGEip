import { Timestamp } from '@angular/fire/firestore';

import { AttachmentMetadata } from '../../attachments/attachment.models';
import { SubsidyStatus, SubsidyType } from '../../services/subsidy.service';

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

export interface JourneyEventInput {
  targetUserId: string;
  eventDate: Date | Timestamp;
  title: string;
  content: string;
}

interface JourneyTimelineItemBase {
  sourceId: string;
  occurredAt: Timestamp;
  title: string;
  content?: string;
  attachments: AttachmentMetadata[];
}

export type JourneyTimelineItem =
  | (JourneyTimelineItemBase & {
      source: 'event';
      event: UserJourneyEvent;
    })
  | (JourneyTimelineItemBase & {
      source: 'subsidy';
      subsidyType?: SubsidyType;
      status?: SubsidyStatus;
      requestedAmount?: number;
      approvedAmount?: number;
    });

export interface TimelinePage {
  items: JourneyTimelineItem[];
  hasMore: boolean;
}

export interface JourneyEventPermissions {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface JourneyEventDialogData {
  targetUserId: string;
  actorUid: string;
  event?: UserJourneyEvent;
  permissions: JourneyEventPermissions;
}

export interface JourneyEventDialogResult {
  input: JourneyEventInput;
  files: File[];
  removedAttachmentIds: string[];
}
