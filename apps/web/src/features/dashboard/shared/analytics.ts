export interface WeeklyShiftHours {
  weekStart: string;
  totalHours: number;
  shiftCount: number;
}

export interface EmployeeUtilization {
  employeeId: string;
  employeeName: string;
  totalHours: number;
  shiftCount: number;
}

export interface DashboardAnalyticsResponse {
  weeklyShiftHours: WeeklyShiftHours[];
  employeeUtilization: EmployeeUtilization[];
}
