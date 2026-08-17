import { AttendanceLog } from '../services/attendance.service';
import { User } from '../services/user.service';

/**
 * Attendance 申請的編輯權限判斷。
 *
 * 這裡是前端的唯一來源，並與 firestore.rules 的 attendanceContentEditable() /
 * attendanceProxyReassignable() 一對一對應；任何一側調整都必須同步另一側，
 * 否則 UI 會再次開放出 Security Rules 會拒絕的入口（GitHub issue #38）。
 */

type AttendanceSubject = Pick<AttendanceLog, 'userId' | 'status'> &
  Pick<Partial<AttendanceLog>, 'proxyUserId'>;
type ActorSubject = Pick<User, 'role'> & { uid?: string };

function proxyUid(attendance: AttendanceSubject): string {
  return attendance.proxyUserId ?? '';
}

/**
 * 可編輯申請內容者：admin、申請人本人、代理人本人。
 * 後兩者僅限申請仍為 pending；admin 不受狀態限制（可代辦已核准申請的更正）。
 */
export function canEditAttendance(
  attendance: AttendanceSubject | null | undefined,
  actor: ActorSubject | null | undefined
): boolean {
  if (!attendance || !actor?.uid) return false;
  if (actor.role === 'admin') return true;
  if (attendance.status !== 'pending') return false;
  return attendance.userId === actor.uid || proxyUid(attendance) === actor.uid;
}

/**
 * 可改派代理人者：admin 與申請人本人。
 *
 * 代理人被刻意排除：代理人若能改派代理人，等同可把編輯權轉發給任意第三方，
 * 形成不受申請人控制的授權鏈。
 */
export function canReassignAttendanceProxy(
  attendance: AttendanceSubject | null | undefined,
  actor: ActorSubject | null | undefined
): boolean {
  if (!attendance || !actor?.uid) return false;
  if (actor.role === 'admin') return true;
  return attendance.status === 'pending' && attendance.userId === actor.uid;
}

/** 可變更申請人（userId）者：僅 admin。rules 對其他路徑一律要求 userId 不變。 */
export function canChangeAttendanceRequester(
  actor: ActorSubject | null | undefined
): boolean {
  return actor?.role === 'admin' && !!actor.uid;
}

/**
 * 可管理附件者：admin 與 pending 狀態的申請人本人。
 *
 * 刻意窄於 canEditAttendance()：附件寫入另有 upload session 與 storage 規則鏈
 * （validUploadSessionParent / hasValidUploadSession），該鏈仍以申請人為準。
 * 若日後要開放代理人管理附件，必須連同那兩處規則一起放寬。
 */
export function canManageAttendanceAttachments(
  attendance: AttendanceSubject | null | undefined,
  actor: ActorSubject | null | undefined
): boolean {
  if (!attendance || !actor?.uid) return false;
  if (actor.role === 'admin') return true;
  return attendance.status === 'pending' && attendance.userId === actor.uid;
}
