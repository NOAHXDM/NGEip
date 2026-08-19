import {
  canChangeAttendanceRequester,
  canEditAttendance,
  canManageAttendanceAttachments,
  canReassignAttendanceProxy,
} from './attendance-permission';

describe('attendance-permission', () => {
  const pending: any = { userId: 'owner', status: 'pending', proxyUserId: 'proxy' };
  const approved: any = { ...pending, status: 'approved' };
  const owner: any = { uid: 'owner', role: 'user' };
  const proxy: any = { uid: 'proxy', role: 'user' };
  const other: any = { uid: 'other', role: 'user' };
  const admin: any = { uid: 'admin', role: 'admin' };

  describe('canEditAttendance', () => {
    it('allows admin regardless of status', () => {
      expect(canEditAttendance(pending, admin)).toBeTrue();
      expect(canEditAttendance(approved, admin)).toBeTrue();
    });

    it('allows the requester and the proxy while pending', () => {
      expect(canEditAttendance(pending, owner)).toBeTrue();
      expect(canEditAttendance(pending, proxy)).toBeTrue();
    });

    it('denies the requester and the proxy once the request left pending', () => {
      expect(canEditAttendance(approved, owner)).toBeFalse();
      expect(canEditAttendance(approved, proxy)).toBeFalse();
    });

    it('denies unrelated users (GitHub issue #38 scope decision)', () => {
      expect(canEditAttendance(pending, other)).toBeFalse();
    });

    // 舊資料沒有 proxyUserId：不可讓空代理人匹配到空 uid。
    it('treats a missing proxy as nobody', () => {
      const legacy: any = { userId: 'owner', status: 'pending' };
      expect(canEditAttendance(legacy, owner)).toBeTrue();
      expect(canEditAttendance(legacy, proxy)).toBeFalse();
      expect(canEditAttendance(legacy, { uid: '', role: 'user' } as any)).toBeFalse();
    });

    it('denies when the attendance or the actor is unknown', () => {
      expect(canEditAttendance(null, admin)).toBeFalse();
      expect(canEditAttendance(pending, null)).toBeFalse();
      expect(canEditAttendance(pending, { role: 'admin' } as any)).toBeFalse();
    });
  });

  describe('canReassignAttendanceProxy', () => {
    // 代理人若能改派代理人，等同可把編輯權轉發給任意第三方。
    it('allows admin and the requester but never the proxy', () => {
      expect(canReassignAttendanceProxy(pending, admin)).toBeTrue();
      expect(canReassignAttendanceProxy(pending, owner)).toBeTrue();
      expect(canReassignAttendanceProxy(pending, proxy)).toBeFalse();
      expect(canReassignAttendanceProxy(pending, other)).toBeFalse();
    });

    it('denies the requester once the request left pending', () => {
      expect(canReassignAttendanceProxy(approved, owner)).toBeFalse();
      expect(canReassignAttendanceProxy(approved, admin)).toBeTrue();
    });
  });

  describe('canChangeAttendanceRequester', () => {
    it('allows admin only', () => {
      expect(canChangeAttendanceRequester(admin)).toBeTrue();
      expect(canChangeAttendanceRequester(owner)).toBeFalse();
      expect(canChangeAttendanceRequester(null)).toBeFalse();
    });
  });

  describe('canManageAttendanceAttachments', () => {
    // 刻意窄於 canEditAttendance：附件另有 upload session 規則鏈以申請人為準。
    it('excludes the proxy', () => {
      expect(canManageAttendanceAttachments(pending, admin)).toBeTrue();
      expect(canManageAttendanceAttachments(pending, owner)).toBeTrue();
      expect(canManageAttendanceAttachments(pending, proxy)).toBeFalse();
      expect(canManageAttendanceAttachments(approved, owner)).toBeFalse();
    });
  });
});
