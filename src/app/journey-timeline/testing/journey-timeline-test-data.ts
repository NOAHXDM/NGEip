import { Timestamp } from 'firebase/firestore';

import { AttachmentMetadata } from '../../attachments/attachment.models';
import { SubsidyStatus, SubsidyType } from '../../services/subsidy.service';

export const JOURNEY_TARGET_UID = 'journey-target-user';
export const JOURNEY_OTHER_UID = 'journey-other-user';
export const JOURNEY_ADMIN_UID = 'journey-admin-user';

/**
 * Builds fixed January 2026 timestamps for deterministic same-month sorting fixtures.
 */
export function testTimestamp(day: number, hour = 9): Timestamp {
  if (day < 1) {
    throw new Error(`testTimestamp: day must be >= 1, got ${day}`);
  }
  if (day > 31) {
    throw new Error(`testTimestamp: day must be <= 31, got ${day}`);
  }
  return Timestamp.fromDate(new Date(Date.UTC(2026, 0, day, hour)));
}

export function journeyAttachment(id: string): AttachmentMetadata {
  return {
    id,
    originalName: `${id}.pdf`,
    storagePath: `journey-event-attachments/${JOURNEY_TARGET_UID}/event-${id}/session-${id}/${id}`,
    contentType: 'application/pdf',
    size: 1024,
    uploadedBy: JOURNEY_ADMIN_UID,
    uploadedAt: testTimestamp(1),
  };
}

export function journeyEventDoc(
  id: string,
  targetUserId: string,
  day: number,
  title = `歷程事件 ${id}`
) {
  const timestamp = testTimestamp(day);
  return {
    targetUserId,
    eventDate: timestamp,
    title,
    content: `${title} 內容`,
    attachments: [],
    createdBy: JOURNEY_ADMIN_UID,
    createdAt: timestamp,
    updatedBy: JOURNEY_ADMIN_UID,
    updatedAt: timestamp,
    lastAuditId: `${id}-audit`,
    deleteAuditId: `${id}-delete-audit`,
  };
}

export function subsidyApplicationDoc(
  userId: string,
  day: number,
  type = SubsidyType.Training,
  status: SubsidyStatus = 'approved',
  hour = 12
) {
  const timestamp = testTimestamp(day, hour);
  return {
    userId,
    type,
    status,
    applicationDate: timestamp,
    invoiceAmount: 1200,
    approvedAmount: 1000,
    content: `補助申請 ${day}`,
    attachments: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function userDoc(uid: string, role: 'admin' | 'user' = 'user') {
  return {
    uid,
    email: `${uid}@test.ngeip`,
    name: uid,
    role,
    remainingLeaveHours: 0,
    remoteWorkEligibility: 'N/A',
    remoteWorkRecommender: [],
    startDate: testTimestamp(1),
  };
}
