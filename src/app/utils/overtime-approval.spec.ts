import { canApproveAttendance, isActiveCallout } from './attendance-permission';
import { AttendanceType } from '../services/attendance.service';
import { User } from '../services/user.service';

describe('overtime approval', () => {
  const users = [{ uid: 'owner' }, { uid: 'callout' }] as User[];
  const request = { type: AttendanceType.Overtime, userId: 'owner', callout: 'callout', status: 'pending' as const };
  it('allows only the current callout and admin, and requires valid data for both', () => {
    expect(canApproveAttendance(request, { uid: 'callout', role: 'user' }, users)).toBeTrue();
    expect(canApproveAttendance(request, { uid: 'owner', role: 'user' }, users)).toBeFalse();
    expect(canApproveAttendance(request, { uid: 'admin', role: 'admin' }, users)).toBeTrue();
    expect(canApproveAttendance({ ...request, callout: '' }, { uid: 'admin', role: 'admin' }, users)).toBeFalse();
    expect(canApproveAttendance({ ...request, callout: 'owner' }, { uid: 'admin', role: 'admin' }, users)).toBeFalse();
    expect(canApproveAttendance({ ...request, status: 'rejected' }, { uid: 'admin', role: 'admin' }, users)).toBeFalse();
  });
  it('treats a future exit date as departed but preserves admin approval', () => {
    const departed = [{ uid: 'callout', exitDate: {} }] as User[];
    expect(isActiveCallout(departed[0])).toBeFalse();
    expect(canApproveAttendance(request, { uid: 'callout', role: 'user' }, departed)).toBeFalse();
    expect(canApproveAttendance(request, { uid: 'admin', role: 'admin' }, departed)).toBeTrue();
  });
  it('treats empty exitDate values written by the advanced profile form as active', () => {
    for (const exitDate of ['', null, undefined]) {
      const user = { uid: 'callout', exitDate } as unknown as User;
      expect(isActiveCallout(user)).toBeTrue();
      expect(canApproveAttendance(request, { uid: 'callout', role: 'user' }, [user])).toBeTrue();
    }
  });
  it('preserves non-overtime approval and rejects anonymous users', () => {
    expect(canApproveAttendance({ ...request, type: AttendanceType.SickLeave }, { uid: 'owner', role: 'user' }, [])).toBeTrue();
    expect(canApproveAttendance(request, null, users)).toBeFalse();
  });
});
