import { AttendanceLog } from '../services/attendance.service';
import { User } from '../services/user.service';

/**
 * Attendance 申請的編輯權限判斷。
 *
 * 這裡是前端的唯一來源，並與 firestore.rules 的 attendanceContentEditable() /
 * attendanceProxyReassignable() 一對一對應；任何一側調整都必須同步另一側，
 * 否則 UI 會再次開放出 Security Rules 會拒絕的入口（GitHub issue #38）。
 */

type AttendanceSubject = Pick<AttendanceLog, 'userId' | 'status' | 'proxyUserId'>;
type ActorSubject = Pick<User, 'role' | 'uid'>;

function proxyUid(attendance: AttendanceSubject): string {
  return attendance.proxyUserId ?? '';
}

/**
 * 「pending 狀態下的申請人本人」。多個政策目前都歸約到這個述詞，
 * 但各自是獨立政策（例如附件是否開放給代理人仍待議），因此維持分開的公開函式，
 * 只共用述詞本身，不共用政策。
 */
function isPendingOwner(
  attendance: AttendanceSubject,
  actor: ActorSubject
): boolean {
  return attendance.status === 'pending' && attendance.userId === actor.uid;
}

/**
 * 可編輯申請內容者：admin、申請人本人、代理人本人。
 *
 * admin 分支不看狀態，是為了對齊 firestore.rules 的 admin 權限。
 * UI 刻意不提供非 pending 的編輯入口：已核准／已拒絕的申請必須先退回待審才能編輯，
 * 這同時保證特休餘額正確（退回待審會退還時數，重新核准再依新時數扣除；
 * 就地編輯已核准申請的 hours 則無任何補正路徑）。
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
  return actor.role === 'admin' || isPendingOwner(attendance, actor);
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
  return actor.role === 'admin' || isPendingOwner(attendance, actor);
}
