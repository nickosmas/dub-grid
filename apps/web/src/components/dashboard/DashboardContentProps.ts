import type { Permissions } from "@/hooks";
import type { ShiftRequestsData } from "@/hooks/useShiftRequests";
import type {
  Organization,
  FocusArea,
  AssignmentDefinition,
  ShiftCategory,
  CoverageRequirement,
  Employee,
  ShiftMap,
  PublishHistoryEntry,
  AbsenceType,
} from "@/types";
import type {
  WeeklyStats,
  SectionCoverage,
  OpenShift,
  OTAlert,
  EmployeeHours,
  ShiftTypeBreakdown,
  ActivityItem,
  TrendDataPoint,
} from "@/lib/dashboard-stats";
import type { ViewMode } from "./DashboardView";
import type { PublishedWindowState } from "@/lib/schedule-logic";

export interface DashboardContentProps {
  // Organization
  org: Organization;
  focusAreas: FocusArea[];
  assignments: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  coverageRequirements: CoverageRequirement[];
  assignmentLabelMap: Map<number, string>;
  assignmentById: Map<number, AssignmentDefinition>;
  employees: Employee[];
  activeEmployees: Employee[];

  // Permissions
  permissions: Permissions;

  // Period
  viewMode: ViewMode;
  periodDates: Date[];
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
  prevPeriodLabel: string;

  // Shift data
  currentPeriodShifts: ShiftMap;
  allShifts: ShiftMap;

  // Computed stats
  periodStats: WeeklyStats;
  sectionCoverage: SectionCoverage[];
  openShifts: OpenShift[];
  otAlerts: OTAlert[];
  currentHours: EmployeeHours[];
  prevHours: EmployeeHours[];
  shiftBreakdown: ShiftTypeBreakdown;
  activityItems: ActivityItem[];
  trendData: TrendDataPoint[];
  publishedWindowState: PublishedWindowState;
  overtimeThreshold: number;

  // Shift requests
  shiftRequests: ShiftRequestsData;

  // Current user
  currentEmpId: string | null;
  currentEmployee: Employee | undefined;

  // Publish history
  publishHistory: PublishHistoryEntry | null;

  // Draft counts
  draftNewCount: number;
  draftModifiedCount: number;
  draftDeletedCount: number;

  // Absence types
  absenceTypeById: Map<number, AbsenceType>;

  // Responsive
  isMobile: boolean;
  isTablet: boolean;

  // Panel controls
  onExpandPanel: (panel: string) => void;
}
