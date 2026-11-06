import { diffAttendance } from './attendance.service';

describe('diffAttendance', () => {
  const start = new Date('2026-11-01T10:00:00');
  const end = new Date('2026-11-01T11:00:00');
  const form = {
    userId: 'owner', type: 3, reason: 'overtime', callout: '', proxyUserId: '',
    startDateTime: start, endDateTime: end,
  };

  it('ignores empty form values for fields missing from legacy documents', () => {
    const legacy = { userId: 'owner', type: 3, reason: 'overtime', startDateTime: start, endDateTime: end };
    expect(diffAttendance(form, legacy)).toBeNull();
    expect(diffAttendance({ ...form, callout: null }, legacy)).toBeNull();
  });

  it('still reports real changes, including filling or clearing existing values', () => {
    const legacy = { userId: 'owner', type: 3, reason: 'overtime', startDateTime: start, endDateTime: end };
    expect(diffAttendance({ ...form, callout: 'active' }, legacy)).toEqual({ callout: 'active' });
    expect(diffAttendance(form, { ...legacy, callout: 'old', proxyUserId: '' })).toEqual({ callout: '' });
    expect(diffAttendance({ ...form, reason: 'changed' }, legacy)).toEqual({ reason: 'changed' });
  });

  it('keeps the original date objects for changed date fields', () => {
    const later = new Date('2026-11-01T12:00:00');
    const legacy = { ...form };
    expect(diffAttendance({ ...form, endDateTime: later }, legacy)).toEqual({ endDateTime: later });
  });
});
