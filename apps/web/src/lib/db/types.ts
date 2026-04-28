import type { RecurringScheduleDraft, ScheduleCellInput } from "@/types";
import type {
  DbAbsenceType,
  DbAssignmentDefinition,
  DbCoverageRequirement,
  DbDepartment,
  DbEmployee,
  DbFocusArea,
  DbIndicatorType,
  DbInvitation,
  DbJobDefinition,
  DbNamedItem,
  DbOrganization,
  DbOrganizationMembership,
  DbRecurringShift,
  DbScheduleCell,
  DbScheduleCellSegment,
  DbScheduleCellSnapshot,
  DbScheduleNote,
  DbShiftCategory,
  DbShiftRequest,
  TenantStats,
} from "@dubgrid/db-types";

export type {
  DbAbsenceType,
  DbAssignmentDefinition,
  DbCoverageRequirement,
  DbDepartment,
  DbEmployee,
  DbFocusArea,
  DbIndicatorType,
  DbInvitation,
  DbJobDefinition,
  DbNamedItem,
  DbOrganization,
  DbOrganizationMembership,
  DbRecurringShift,
  DbScheduleCell,
  DbScheduleCellSegment,
  DbScheduleCellSnapshot,
  DbScheduleNote,
  DbShiftCategory,
  DbShiftRequest,
  TenantStats,
} from "@dubgrid/db-types";

export interface RecurringDraft {
  id: string;
  orgId: string;
  savedBy: string;
  draftData: RecurringScheduleDraft;
  savedAt: string;
}

export type { ScheduleCellInput };
