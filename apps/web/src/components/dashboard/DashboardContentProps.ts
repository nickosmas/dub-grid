import type { WebPermissions } from "@/hooks";
import type { ShiftRequestsData } from "@/hooks/useShiftRequests";
import type {
  Organization,
  FocusArea,
  AssignmentDefinition,
  ShiftCategory,
  JobDefinition,
  CoverageRequirement,
  Employee,
  ShiftMap,
  PublishChange,
  PublishHistoryEntryWithName,
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
} from "@/lib/dashboard-stats";
import type { ViewMode } from "./DashboardView";
import type { PublishedWindowState } from "@/lib/schedule-logic";

export interface DashboardContentProps {
  // Organization
  org: Organization;
  focusAreas: FocusArea[];
  assignments: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  coverageRequirements: CoverageRequirement[];
  /** At least one requirement asks for staff and maps to an active assignment. */
  hasCoverageRequirements: boolean;
  assignmentLabelMap: Map<number, string>;
  assignmentNameMap: Map<number, string>;
  assignmentById: Map<number, AssignmentDefinition>;
  /**
   * Shift/job pair to assignment id, archived definitions included, so a
   * published snapshot that names a since-archived assignment still diffs.
   */
  publishedAssignmentIdByPair?: Map<string, number>;
  employees: Employee[];
  activeEmployees: Employee[];

  // Permissions
  permissions: WebPermissions;

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
  /** Latest published change for each affected employee/date cell. */
  recentPublishedChanges?: Map<string, PublishChange>;

  // Computed stats
  periodStats: WeeklyStats;
  sectionCoverage: SectionCoverage[];
  openShifts: OpenShift[];
  otAlerts: OTAlert[];
  currentHours: EmployeeHours[];
  prevHours: EmployeeHours[];
  shiftBreakdown: ShiftTypeBreakdown;
  activityItems: ActivityItem[];
  publishedWindowState: PublishedWindowState;
  overtimeThreshold: number;

  // Shift requests
  shiftRequests: ShiftRequestsData;

  // Current user
  currentEmpId: string | null;
  currentEmployee: Employee | undefined;

  // Publish history
  publishHistory: PublishHistoryEntryWithName | null;

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
