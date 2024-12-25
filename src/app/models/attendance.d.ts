interface AttendanceLog {
  approver?: string;
  auditTrail: AttendanceLogAuditTrail[];
  callout?: string; // 外援呼叫
  endDateTime: Date;
  hours: number;
  proxyUserId?: string;
  proxyUserName?: string;
  reason: string;
  reasonPriority?: ReasonPriority;
  startDateTime: Date;
  status: 'pending' | 'approved' | 'rejected';
  type: AttendanceType;
  userId: string;
  userName: string;
}

enum AttendanceType {
  SickLeave = 1, // 病假
  PersonalLeave = 2, // 事假
  Overtime = 3, // 加班
  AnnualLeave = 4, // 特休
  RemoteWork = 5, // 遠距工作
  MenstrualLeave = 6, // 生理假
  BereavementLeave = 7, // 喪假
  OfficialLeave = 8, // 公假
  MarriageLeave = 9, // 婚假
  MaternityLeave = 10, // 產假
  PaternityLeave = 11, // 陪產假
}

enum ReasonPriority {
  First = 1, // 線上災難
  Second = 2, // 插件
  Third = 3, // Deadline
  Fourth = 4, // 補時數
  Fifth = 5, // 創意性質
}

interface AttendanceLogAuditTrail {
  action: 'create' | 'update' | 'delete';
  actionBy: string;
  actionDateTime: Date;
}
