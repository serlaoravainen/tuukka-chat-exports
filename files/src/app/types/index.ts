export interface ShiftType {
  type: 'normal' | 'locked' | 'absent' | 'holiday' | 'empty';
  minutes?: number;
  icon?: React.ReactNode;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  isActive: boolean;
  shifts: ShiftType[];
}

export interface AbsenceRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'declined';
  submittedAt: string;
  message?: string;
}

export interface DateInfo {
  day: string;
  date: string;
  fullDate: Date; // lisätään tämä
}


export interface EmployeeTimeOffRequest {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'declined';
  submittedAt: string;
  message?: string;
}

export interface ShiftChangeRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  currentDate: string;
  currentShift: ShiftType;
  requestedDate: string;
  requestedShift?: ShiftType;
  reason: string;
  status: 'pending' | 'approved' | 'declined';
  submittedAt: string;
  message?: string;
  targetEmployeeId?: string;
  targetEmployeeName?: string;
}

export interface EmployeeNotification {
  id: string;
  type: 'absence_approved' | 'absence_declined' | 'shift_approved' | 'shift_declined' | 'schedule_published' | 'schedule_updated' | 'reminder' | 'system';
  title: string;
  message: string;
  created_at: string;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high';
}

export type TimePeriod = number;

export interface AppSettings {
  general: {
    weekStartDay: 'monday' | 'sunday';
    dateFormat: 'dd.mm.yyyy' | 'mm/dd/yyyy' | 'yyyy-mm-dd';
  };
}
