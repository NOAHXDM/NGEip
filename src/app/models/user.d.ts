interface User {
  birthday?: Date;
  displayName?: string;
  email: string;
  jobRank?: string;
  jobTitle?: string;
  leaveTransactionHistory: LeaveTransaction[]; // 休假交易紀錄
  name?: string;
  phone?: string;
  photo?: string;
  remainingLeaveHours: number; // 剩餘特休時數
  remoteWorkEligibility: 'N/A' | 'WFH2' | 'WFH4.5'; // 遠距工作資格
  remoteWorkRecommender: string[];
  role: 'admin' | 'user';
  startDate?: Date; // 到職日
}

interface LeaveTransaction {
  actionBy?: string;
  date: Date;
  hours: number;
  reason?: string;
  type: 'add' | 'deduct';
}
