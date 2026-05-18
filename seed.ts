import { copycat } from "@snaplet/copycat";
import { readFileSync } from "fs";
import { Client } from "pg";
import { getPresetByBg, normalizePresetBg } from "./apps/web/src/lib/colors";

// ═══════════════════════════════════════════════════════════════════════════
// 5-Tenant Seed: Realistic healthcare scheduling data
// Uses @snaplet/copycat for deterministic fake data, raw pg for inserts
// ═══════════════════════════════════════════════════════════════════════════

interface AssignmentDef {
  label: string;
  name: string;
  color: string;
  border_color: string;
  text_color: string;
  is_general: boolean;
  faIndex: number | null;
  catIndex: number | null;
  start?: string;
  end?: string;
}

const FOCUS_AREA_PRESET_COLORS = [
  "#BFDBFE",
  "#A7F3D0",
  "#FDE68A",
  "#DDD6FE",
  "#FBCFE8",
  "#A5F3FC",
  "#D9F99D",
  "#FED7AA",
];

interface AbsenceTypeDef {
  label: string;
  name: string;
  color: string;
  border_color: string;
  text_color: string;
}

interface SeedRoleRow {
  id: number;
  name: string;
  abbr: string;
}

interface SeedFocusAreaRow {
  id: number;
  department_id: number | null;
  color: string | null;
}

interface SeedShiftCategoryRow {
  id: number;
  name: string;
  abbr: string | null;
  focus_area_id: number | null;
  start_time: string | null;
  end_time: string | null;
  color: string;
  sort_order: number;
}

interface SeedAssignmentRow {
  id: number;
  label: string;
  name: string;
  color: string;
  border_color: string;
  text_color: string;
  is_general: boolean;
  focus_area_id: number | null;
  category_id: number | null;
  sort_order: number;
  default_start_time: string | null;
  default_end_time: string | null;
  default_duration_hours: number | null;
  default_duration_minutes: number | null;
  required_certification_ids: number[];
}

interface ResolvedSeedAssignmentRow {
  label: string;
  focus_area_id: number | null;
  shift_id: number | null;
  job_id: number;
  sort_order: number;
}

interface DerivedJobSeed {
  key: string;
  name: string;
  abbr: string;
  show_on_grid: boolean;
  assignment_mode: "with_shift" | "shiftless";
  eligibility_mode: "and" | "or";
  focus_area_ids: number[];
  department_ids: number[];
  applicable_shift_ids: number[];
  eligible_role_ids: number[];
  required_certification_ids: number[];
  color: string;
  border_color: string;
  text_color: string;
  shift_time_overrides: Record<string, { startTime: string | null; endTime: string | null }>;
  shift_color_overrides: Record<string, string>;
  default_start_time: string | null;
  default_end_time: string | null;
  default_duration_hours: number | null;
  default_duration_minutes: number | null;
  sort_order: number;
  system_key: string | null;
}

const DEFAULT_JOB_PRESET = getPresetByBg(normalizePresetBg(null));

function deriveSeedAbbr(value: string, fallback = "GEN"): string {
  const next = buildFallbackAbbr(value).trim().toUpperCase();
  return next.length > 0 ? next : fallback;
}

function deriveShiftTimeOverride(
  code: SeedAssignmentRow,
  shift: SeedShiftCategoryRow,
): { startTime: string | null; endTime: string | null } | null {
  const startTime =
    code.default_start_time != null && code.default_start_time !== shift.start_time
      ? code.default_start_time
      : null;
  const endTime =
    code.default_end_time != null && code.default_end_time !== shift.end_time
      ? code.default_end_time
      : null;

  if (startTime == null && endTime == null) {
    return null;
  }

  return { startTime, endTime };
}

const TENANTS = [
  {
    name: "Sunrise Senior Living",
    slug: "sunrise-senior",
    address: "450 Sutter St, San Francisco, CA 94108",
    phone: "(415) 555-0101",
    timezone: "America/Los_Angeles",
    focus_area_label: "Units",
    certification_label: "Certifications",
    role_label: "Positions",
    focusAreas: [
      { name: "Memory Care" },
      { name: "Assisted Living" },
      { name: "Independent Living" },
      { name: "Respite Care" },
    ],
    certifications: [
      { name: "Registered Nurse", abbr: "RN", deptIndex: 0 },
      { name: "Licensed Practical Nurse", abbr: "LPN", deptIndex: 0 },
      { name: "Certified Nursing Assistant", abbr: "CNA", deptIndex: 0 },
      { name: "Home Health Aide", abbr: "HHA", deptIndex: 1 },
      { name: "Medication Aide", abbr: "MA", deptIndex: null },
      { name: "Other", abbr: "Other", deptIndex: null },
    ],
    orgRoles: [
      { name: "Charge Nurse", abbr: "CN", deptIndex: 0 },
      { name: "Supervisor", abbr: "SUP", deptIndex: null },
      { name: "Activities Director", abbr: "AD", deptIndex: 1 },
      { name: "Med Tech", abbr: "MT", deptIndex: 0 },
    ],
    departments: [
      // Scheduled departments — focus areas linked to these
      { name: "Nursing", type: "scheduled" as const },
      { name: "Residential", type: "scheduled" as const },
      // Management departments (with permission templates)
      { name: "Administration", type: "management" as const, permissions: {
        canViewSchedule: true, canEditShifts: true, canPublishSchedule: true, canApplyRecurringSchedule: true,
        canEditNotes: true, canEditScheduleIndicators: true, canManageRecurringShifts: true, canManageShiftSeries: true,
        canViewStaff: true, canManageEmployees: true, canManageFocusAreas: true,
        canManageScheduleDefinitions: true, canManageIndicatorTypes: true, canManageOrgSettings: false,
        canManageOrgLabels: true, canManageCoverageRequirements: true, canApproveShiftRequests: true,
      }},
      { name: "Human Resources", type: "management" as const, permissions: {
        canViewSchedule: true, canEditShifts: false, canPublishSchedule: false, canApplyRecurringSchedule: false,
        canEditNotes: false, canEditScheduleIndicators: false, canManageRecurringShifts: false, canManageShiftSeries: false,
        canViewStaff: true, canManageEmployees: true, canManageFocusAreas: false,
        canManageScheduleDefinitions: false, canManageIndicatorTypes: false, canManageOrgSettings: false,
        canManageOrgLabels: false, canManageCoverageRequirements: false, canApproveShiftRequests: false,
      }},
      { name: "Maintenance", type: "management" as const },
    ],
    // Memory Care → Nursing (0), Assisted Living → Residential (1),
    // Independent Living → Residential (1), Respite Care → Nursing (0)
    focusAreaDeptIndex: [0, 1, 1, 0],
    shiftCategories: [
      { name: "Day Shift", start_time: "07:00", end_time: "15:00", faIndex: 0 },
      { name: "Evening Shift", start_time: "15:00", end_time: "23:00", faIndex: 0 },
      { name: "Night Shift", start_time: "23:00", end_time: "07:00", faIndex: 0 },
      { name: "Day Shift", start_time: "07:00", end_time: "15:00", faIndex: 1 },
      { name: "Evening Shift", start_time: "15:00", end_time: "23:00", faIndex: 1 },
      { name: "Day Shift", start_time: "08:00", end_time: "16:00", faIndex: 2 },
      { name: "Day Shift", start_time: "08:00", end_time: "16:00", faIndex: 3 },
    ],
    absenceTypes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B" },
      { label: "V", name: "Vacation", color: "#A5F3FC", border_color: "transparent", text_color: "#155E75" },
      { label: "S", name: "Sick", color: "#FECDD3", border_color: "transparent", text_color: "#9F1239" },
      { label: "PTO", name: "Paid Time Off", color: "#FDE68A", border_color: "transparent", text_color: "#92400E" },
      { label: "P", name: "Personal", color: "#DDD6FE", border_color: "transparent", text_color: "#5B21B6" },
      { label: "B", name: "Bereavement", color: "#BAE6FD", border_color: "transparent", text_color: "#075985" },
      { label: "J", name: "Jury Duty", color: "#C7D2FE", border_color: "transparent", text_color: "#3730A3" },
      { label: "H", name: "Holiday", color: "#BBF7D0", border_color: "transparent", text_color: "#166534" },
      { label: "CME", name: "Education / Training", color: "#D9F99D", border_color: "transparent", text_color: "#3F6212" },
      { label: "FMLA", name: "Family / Medical Leave", color: "#FBCFE8", border_color: "transparent", text_color: "#9D174D" },
      { label: "UX", name: "Unpaid Leave", color: "#FED7AA", border_color: "transparent", text_color: "#9A3412" },
    ] as AbsenceTypeDef[],
    assignments: [
      { label: "Ofc", name: "Office", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_general: true, faIndex: null, catIndex: null },
      { label: "0.3", name: "Partial", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_general: true, faIndex: null, catIndex: null },
      { label: "D", name: "Day", color: "#A5F3FC", border_color: "transparent", text_color: "#155E75", is_general: false, faIndex: 0, catIndex: 0, start: "07:00", end: "15:00" },
      { label: "E", name: "Evening", color: "#FDE68A", border_color: "transparent", text_color: "#92400E", is_general: false, faIndex: 0, catIndex: 1, start: "15:00", end: "23:00" },
      { label: "N", name: "Night", color: "#FECDD3", border_color: "transparent", text_color: "#9F1239", is_general: false, faIndex: 0, catIndex: 2, start: "23:00", end: "07:00" },
      { label: "D", name: "Day", color: "#C7D2FE", border_color: "transparent", text_color: "#3730A3", is_general: false, faIndex: 1, catIndex: 3, start: "07:00", end: "15:00" },
      { label: "E", name: "Evening", color: "#FDE68A", border_color: "transparent", text_color: "#92400E", is_general: false, faIndex: 1, catIndex: 4, start: "15:00", end: "23:00" },
      { label: "D", name: "Day", color: "#A7F3D0", border_color: "transparent", text_color: "#065F46", is_general: false, faIndex: 2, catIndex: 5, start: "08:00", end: "16:00" },
      { label: "D", name: "Day", color: "#BFDBFE", border_color: "transparent", text_color: "#1E40AF", is_general: false, faIndex: 3, catIndex: 6, start: "08:00", end: "16:00" },
    ] as AssignmentDef[],
    employeeCount: 35,
    indicatorTypes: [
      { name: "Readings", color: "#FDE047" },
      { name: "Shower", color: "#FDE68A" },
      { name: "Weight Check", color: "#FED7AA" },
    ],
  },
  {
    name: "Harbor Health Center",
    slug: "harbor-health",
    address: "1200 NW Marshall St, Portland, OR 97209",
    phone: "(503) 555-0202",
    timezone: "America/Los_Angeles",
    focus_area_label: "Departments",
    certification_label: "Licenses",
    role_label: "Roles",
    focusAreas: [
      { name: "Skilled Nursing" },
      { name: "Rehabilitation" },
      { name: "Hospice" },
      { name: "Outpatient" },
    ],
    certifications: [
      { name: "Registered Nurse", abbr: "RN", deptIndex: 0 },
      { name: "Licensed Vocational Nurse", abbr: "LVN", deptIndex: 0 },
      { name: "Certified Nursing Assistant", abbr: "CNA", deptIndex: 0 },
      { name: "Physical Therapist", abbr: "PT", deptIndex: 1 },
      { name: "Occupational Therapist", abbr: "OT", deptIndex: 1 },
      { name: "Other", abbr: "Other", deptIndex: null },
    ],
    orgRoles: [
      { name: "Charge Nurse", abbr: "CN", deptIndex: 0 },
      { name: "Floor Lead", abbr: "FL", deptIndex: 0 },
      { name: "Rehab Tech", abbr: "RT", deptIndex: 1 },
      { name: "Case Manager", abbr: "CM", deptIndex: 2 },
    ],
    departments: [
      { name: "Nursing", type: "scheduled" as const },
      { name: "Rehabilitation", type: "scheduled" as const },
      { name: "Palliative Services", type: "scheduled" as const },
      { name: "Administration", type: "management" as const },
      { name: "Human Resources", type: "management" as const },
    ],
    // Skilled Nursing → Nursing (0), Rehabilitation → Rehabilitation (1),
    // Hospice → Palliative Services (2), Outpatient → Nursing (0)
    focusAreaDeptIndex: [0, 1, 2, 0],
    shiftCategories: [
      { name: "Day Shift", start_time: "06:00", end_time: "14:00", faIndex: 0 },
      { name: "Swing Shift", start_time: "14:00", end_time: "22:00", faIndex: 0 },
      { name: "Night Shift", start_time: "22:00", end_time: "06:00", faIndex: 0 },
      { name: "Day Shift", start_time: "08:00", end_time: "16:30", faIndex: 1 },
      { name: "Day Shift", start_time: "08:00", end_time: "16:00", faIndex: 2 },
      { name: "Clinic Hours", start_time: "09:00", end_time: "17:00", faIndex: 3 },
    ],
    absenceTypes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B" },
      { label: "V", name: "Vacation", color: "#A5F3FC", border_color: "transparent", text_color: "#155E75" },
      { label: "S", name: "Sick", color: "#FECDD3", border_color: "transparent", text_color: "#9F1239" },
      { label: "PTO", name: "Paid Time Off", color: "#FDE68A", border_color: "transparent", text_color: "#92400E" },
      { label: "P", name: "Personal", color: "#DDD6FE", border_color: "transparent", text_color: "#5B21B6" },
      { label: "B", name: "Bereavement", color: "#BAE6FD", border_color: "transparent", text_color: "#075985" },
      { label: "J", name: "Jury Duty", color: "#C7D2FE", border_color: "transparent", text_color: "#3730A3" },
      { label: "H", name: "Holiday", color: "#BBF7D0", border_color: "transparent", text_color: "#166534" },
      { label: "CME", name: "Education / Training", color: "#D9F99D", border_color: "transparent", text_color: "#3F6212" },
      { label: "FMLA", name: "Family / Medical Leave", color: "#FBCFE8", border_color: "transparent", text_color: "#9D174D" },
      { label: "UX", name: "Unpaid Leave", color: "#FED7AA", border_color: "transparent", text_color: "#9A3412" },
    ] as AbsenceTypeDef[],
    assignments: [
      { label: "Ofc", name: "Office", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_general: true, faIndex: null, catIndex: null },
      { label: "0.3", name: "Partial", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_general: true, faIndex: null, catIndex: null },
      { label: "D", name: "Day", color: "#99F6E4", border_color: "transparent", text_color: "#115E59", is_general: false, faIndex: 0, catIndex: 0, start: "06:00", end: "14:00" },
      { label: "Sw", name: "Swing", color: "#E9D5FF", border_color: "transparent", text_color: "#6B21A8", is_general: false, faIndex: 0, catIndex: 1, start: "14:00", end: "22:00" },
      { label: "N", name: "Night", color: "#FED7AA", border_color: "transparent", text_color: "#9A3412", is_general: false, faIndex: 0, catIndex: 2, start: "22:00", end: "06:00" },
      { label: "R", name: "Rehab", color: "#C7D2FE", border_color: "transparent", text_color: "#3730A3", is_general: false, faIndex: 1, catIndex: 3, start: "08:00", end: "16:30" },
      { label: "H", name: "Hospice", color: "#F5D0FE", border_color: "transparent", text_color: "#86198F", is_general: false, faIndex: 2, catIndex: 4, start: "08:00", end: "16:00" },
      { label: "C", name: "Clinic", color: "#FDE68A", border_color: "transparent", text_color: "#92400E", is_general: false, faIndex: 3, catIndex: 5, start: "09:00", end: "17:00" },
    ] as AssignmentDef[],
    employeeCount: 40,
    indicatorTypes: [
      { name: "Vitals", color: "#BFDBFE" },
      { name: "Therapy Session", color: "#E9D5FF" },
      { name: "Pain Assessment", color: "#E9D5FF" },
    ],
  },
  {
    name: "Evergreen Care Home",
    slug: "evergreen-care",
    address: "800 Pike St, Seattle, WA 98101",
    phone: "(206) 555-0303",
    timezone: "America/Los_Angeles",
    focus_area_label: "Wings",
    certification_label: "Skill Levels",
    role_label: "Titles",
    focusAreas: [
      { name: "East Wing" },
      { name: "West Wing" },
      { name: "Garden Wing" },
      { name: "North Wing" },
    ],
    certifications: [
      { name: "Caregiver", abbr: "CG", deptIndex: 0 },
      { name: "Medication Technician", abbr: "MT", deptIndex: 0 },
      { name: "Activity Director", abbr: "AD", deptIndex: 1 },
      { name: "Senior Caregiver", abbr: "SC", deptIndex: 0 },
      { name: "Other", abbr: "Other", deptIndex: null },
    ],
    orgRoles: [
      { name: "Lead Caregiver", abbr: "LC", deptIndex: 0 },
      { name: "Medication Aide", abbr: "MA", deptIndex: 0 },
      { name: "Shift Supervisor", abbr: "SS", deptIndex: null },
    ],
    departments: [
      { name: "Caregiving", type: "scheduled" as const },
      { name: "Activities & Enrichment", type: "scheduled" as const },
      { name: "Administration", type: "management" as const },
      { name: "Facilities", type: "management" as const },
    ],
    // East Wing → Caregiving (0), West Wing → Caregiving (0),
    // Garden Wing → Activities & Enrichment (1), North Wing → Caregiving (0)
    focusAreaDeptIndex: [0, 0, 1, 0],
    shiftCategories: [
      { name: "Morning", start_time: "07:00", end_time: "15:00", faIndex: 0 },
      { name: "Afternoon", start_time: "15:00", end_time: "23:00", faIndex: 0 },
      { name: "Morning", start_time: "07:00", end_time: "15:00", faIndex: 1 },
      { name: "Afternoon", start_time: "15:00", end_time: "23:00", faIndex: 1 },
      { name: "Morning", start_time: "07:00", end_time: "15:00", faIndex: 2 },
      { name: "Afternoon", start_time: "15:00", end_time: "23:00", faIndex: 2 },
      { name: "Morning", start_time: "07:00", end_time: "15:00", faIndex: 3 },
      { name: "Afternoon", start_time: "15:00", end_time: "23:00", faIndex: 3 },
    ],
    absenceTypes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B" },
      { label: "V", name: "Vacation", color: "#A5F3FC", border_color: "transparent", text_color: "#155E75" },
      { label: "S", name: "Sick", color: "#FECDD3", border_color: "transparent", text_color: "#9F1239" },
      { label: "PTO", name: "Paid Time Off", color: "#FDE68A", border_color: "transparent", text_color: "#92400E" },
      { label: "P", name: "Personal", color: "#DDD6FE", border_color: "transparent", text_color: "#5B21B6" },
      { label: "B", name: "Bereavement", color: "#BAE6FD", border_color: "transparent", text_color: "#075985" },
      { label: "J", name: "Jury Duty", color: "#C7D2FE", border_color: "transparent", text_color: "#3730A3" },
      { label: "H", name: "Holiday", color: "#BBF7D0", border_color: "transparent", text_color: "#166534" },
      { label: "CME", name: "Education / Training", color: "#D9F99D", border_color: "transparent", text_color: "#3F6212" },
      { label: "FMLA", name: "Family / Medical Leave", color: "#FBCFE8", border_color: "transparent", text_color: "#9D174D" },
      { label: "UX", name: "Unpaid Leave", color: "#FED7AA", border_color: "transparent", text_color: "#9A3412" },
    ] as AbsenceTypeDef[],
    assignments: [
      { label: "Ofc", name: "Office", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_general: true, faIndex: null, catIndex: null },
      { label: "0.3", name: "Partial", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_general: true, faIndex: null, catIndex: null },
      { label: "M", name: "Morning", color: "#BBF7D0", border_color: "transparent", text_color: "#166534", is_general: false, faIndex: 0, catIndex: 0, start: "07:00", end: "15:00" },
      { label: "A", name: "Afternoon", color: "#FED7AA", border_color: "transparent", text_color: "#9A3412", is_general: false, faIndex: 0, catIndex: 1, start: "15:00", end: "23:00" },
      { label: "M", name: "Morning", color: "#FECACA", border_color: "transparent", text_color: "#991B1B", is_general: false, faIndex: 1, catIndex: 2, start: "07:00", end: "15:00" },
      { label: "A", name: "Afternoon", color: "#FBCFE8", border_color: "transparent", text_color: "#9D174D", is_general: false, faIndex: 1, catIndex: 3, start: "15:00", end: "23:00" },
      { label: "M", name: "Morning", color: "#BAE6FD", border_color: "transparent", text_color: "#075985", is_general: false, faIndex: 2, catIndex: 4, start: "07:00", end: "15:00" },
      { label: "A", name: "Afternoon", color: "#FECACA", border_color: "transparent", text_color: "#991B1B", is_general: false, faIndex: 2, catIndex: 5, start: "15:00", end: "23:00" },
      { label: "M", name: "Morning", color: "#A5F3FC", border_color: "transparent", text_color: "#155E75", is_general: false, faIndex: 3, catIndex: 6, start: "07:00", end: "15:00" },
      { label: "A", name: "Afternoon", color: "#99F6E4", border_color: "transparent", text_color: "#115E59", is_general: false, faIndex: 3, catIndex: 7, start: "15:00", end: "23:00" },
    ] as AssignmentDef[],
    employeeCount: 32,
    indicatorTypes: [
      { name: "Medication", color: "#FDE68A" },
      { name: "Activity", color: "#FDE047" },
      { name: "Bath Day", color: "#A5F3FC" },
    ],
  },
  {
    name: "Pacific Wellness Group",
    slug: "pacific-wellness",
    address: "9000 Wilshire Blvd, Beverly Hills, CA 90210",
    phone: "(310) 555-0404",
    timezone: "America/Los_Angeles",
    focus_area_label: "Service Lines",
    certification_label: "Credentials",
    role_label: "Roles",
    focusAreas: [
      { name: "Acute Care" },
      { name: "Long-term Care" },
      { name: "Outpatient" },
      { name: "Emergency" },
      { name: "Behavioral Health" },
    ],
    certifications: [
      { name: "Doctor of Medicine", abbr: "MD", deptIndex: null },
      { name: "Registered Nurse", abbr: "RN", deptIndex: 0 },
      { name: "Physician Assistant", abbr: "PA", deptIndex: null },
      { name: "Medical Assistant", abbr: "MA", deptIndex: null },
      { name: "Respiratory Therapist", abbr: "RT", deptIndex: 0 },
      { name: "Social Worker", abbr: "SW", deptIndex: null },
      { name: "Other", abbr: "Other", deptIndex: null },
    ],
    orgRoles: [
      { name: "Attending", abbr: "ATT", deptIndex: null },
      { name: "Charge Nurse", abbr: "CN", deptIndex: 0 },
      { name: "Nurse Manager", abbr: "NM", deptIndex: 0 },
      { name: "Technician", abbr: "Tech", deptIndex: null },
      { name: "Social Worker", abbr: "SW", deptIndex: null },
    ],
    departments: [
      { name: "Nursing", type: "scheduled" as const },
      { name: "Outpatient Services", type: "scheduled" as const },
      { name: "Emergency Medicine", type: "scheduled" as const },
      { name: "Administration", type: "management" as const },
      { name: "Finance", type: "management" as const },
      { name: "Quality Assurance", type: "management" as const },
    ],
    // Acute Care → Nursing (0), Long-term Care → Nursing (0),
    // Outpatient → Outpatient Services (1), Emergency → Emergency Medicine (2),
    // Behavioral Health → Nursing (0)
    focusAreaDeptIndex: [0, 0, 1, 2, 0],
    shiftCategories: [
      { name: "Day Shift (12hr)", start_time: "07:00", end_time: "19:00", faIndex: 0 },
      { name: "Night Shift (12hr)", start_time: "19:00", end_time: "07:00", faIndex: 0 },
      { name: "Day Shift", start_time: "07:00", end_time: "15:30", faIndex: 1 },
      { name: "Evening Shift", start_time: "15:30", end_time: "23:30", faIndex: 1 },
      { name: "Clinic Hours", start_time: "08:00", end_time: "17:00", faIndex: 2 },
      { name: "ER Shift (12hr)", start_time: "07:00", end_time: "19:00", faIndex: 3 },
      { name: "Day Shift", start_time: "08:00", end_time: "16:00", faIndex: 4 },
    ],
    absenceTypes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B" },
      { label: "V", name: "Vacation", color: "#A5F3FC", border_color: "transparent", text_color: "#155E75" },
      { label: "S", name: "Sick", color: "#FECDD3", border_color: "transparent", text_color: "#9F1239" },
      { label: "PTO", name: "Paid Time Off", color: "#FDE68A", border_color: "transparent", text_color: "#92400E" },
      { label: "P", name: "Personal", color: "#DDD6FE", border_color: "transparent", text_color: "#5B21B6" },
      { label: "B", name: "Bereavement", color: "#BAE6FD", border_color: "transparent", text_color: "#075985" },
      { label: "J", name: "Jury Duty", color: "#C7D2FE", border_color: "transparent", text_color: "#3730A3" },
      { label: "H", name: "Holiday", color: "#BBF7D0", border_color: "transparent", text_color: "#166534" },
      { label: "CME", name: "Education / Training", color: "#D9F99D", border_color: "transparent", text_color: "#3F6212" },
      { label: "FMLA", name: "Family / Medical Leave", color: "#FBCFE8", border_color: "transparent", text_color: "#9D174D" },
      { label: "UX", name: "Unpaid Leave", color: "#FED7AA", border_color: "transparent", text_color: "#9A3412" },
    ] as AbsenceTypeDef[],
    assignments: [
      { label: "Ofc", name: "Office", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_general: true, faIndex: null, catIndex: null },
      { label: "0.3", name: "Partial", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_general: true, faIndex: null, catIndex: null },
      { label: "12D", name: "12hr Day", color: "#D9F99D", border_color: "transparent", text_color: "#3F6212", is_general: false, faIndex: 0, catIndex: 0, start: "07:00", end: "19:00" },
      { label: "12N", name: "12hr Night", color: "#F5D0FE", border_color: "transparent", text_color: "#86198F", is_general: false, faIndex: 0, catIndex: 1, start: "19:00", end: "07:00" },
      { label: "D", name: "Day", color: "#FDE047", border_color: "transparent", text_color: "#854D0E", is_general: false, faIndex: 1, catIndex: 2, start: "07:00", end: "15:30" },
      { label: "E", name: "Evening", color: "#D9F99D", border_color: "transparent", text_color: "#3F6212", is_general: false, faIndex: 1, catIndex: 3, start: "15:30", end: "23:30" },
      { label: "C", name: "Clinic", color: "#FECACA", border_color: "transparent", text_color: "#991B1B", is_general: false, faIndex: 2, catIndex: 4, start: "08:00", end: "17:00" },
      { label: "ER", name: "ER Shift", color: "#FDE68A", border_color: "transparent", text_color: "#92400E", is_general: false, faIndex: 3, catIndex: 5, start: "07:00", end: "19:00" },
      { label: "BH", name: "Behavioral", color: "#A5F3FC", border_color: "transparent", text_color: "#155E75", is_general: false, faIndex: 4, catIndex: 6, start: "08:00", end: "16:00" },
    ] as AssignmentDef[],
    employeeCount: 45,
    indicatorTypes: [
      { name: "Assessment", color: "#DDD6FE" },
      { name: "Rounds", color: "#E2E8F0" },
      { name: "Discharge Planning", color: "#FDE68A" },
      { name: "Code Status Review", color: "#BFDBFE" },
    ],
  },
  {
    name: "Mountain View Hospice",
    slug: "mountain-view",
    address: "2100 Blake St, Denver, CO 80205",
    phone: "(720) 555-0505",
    timezone: "America/Denver",
    focus_area_label: "Programs",
    certification_label: "Certifications",
    role_label: "Disciplines",
    focusAreas: [
      { name: "Inpatient Hospice" },
      { name: "Home Care" },
      { name: "Bereavement" },
    ],
    certifications: [
      { name: "Registered Nurse", abbr: "RN", deptIndex: 0 },
      { name: "Licensed Practical Nurse", abbr: "LPN", deptIndex: 0 },
      { name: "Social Worker", abbr: "SW", deptIndex: null },
      { name: "Chaplain", abbr: "CH", deptIndex: null },
      { name: "Volunteer", abbr: "VOL", deptIndex: 3 },
      { name: "Other", abbr: "Other", deptIndex: null },
    ],
    orgRoles: [
      { name: "Case Manager", abbr: "CM", deptIndex: 0 },
      { name: "Team Lead", abbr: "TL", deptIndex: null },
      { name: "On-Call", abbr: "OC", deptIndex: 0 },
    ],
    departments: [
      { name: "Clinical Services", type: "scheduled" as const },
      { name: "Community Outreach", type: "scheduled" as const },
      { name: "Administration", type: "management" as const },
      { name: "Volunteer Coordination", type: "management" as const },
    ],
    // Inpatient Hospice → Clinical Services (0), Home Care → Clinical Services (0),
    // Bereavement → Community Outreach (1)
    focusAreaDeptIndex: [0, 0, 1],
    shiftCategories: [
      { name: "Day Shift", start_time: "07:00", end_time: "15:00", faIndex: 0 },
      { name: "Evening Shift", start_time: "15:00", end_time: "23:00", faIndex: 0 },
      { name: "Night Shift", start_time: "23:00", end_time: "07:00", faIndex: 0 },
      { name: "Field Visits", start_time: "08:00", end_time: "17:00", faIndex: 1 },
      { name: "Support Group", start_time: "10:00", end_time: "16:00", faIndex: 2 },
    ],
    absenceTypes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B" },
      { label: "V", name: "Vacation", color: "#A5F3FC", border_color: "transparent", text_color: "#155E75" },
      { label: "S", name: "Sick", color: "#FECDD3", border_color: "transparent", text_color: "#9F1239" },
      { label: "PTO", name: "Paid Time Off", color: "#FDE68A", border_color: "transparent", text_color: "#92400E" },
      { label: "P", name: "Personal", color: "#DDD6FE", border_color: "transparent", text_color: "#5B21B6" },
      { label: "B", name: "Bereavement", color: "#BAE6FD", border_color: "transparent", text_color: "#075985" },
      { label: "J", name: "Jury Duty", color: "#C7D2FE", border_color: "transparent", text_color: "#3730A3" },
      { label: "H", name: "Holiday", color: "#BBF7D0", border_color: "transparent", text_color: "#166534" },
      { label: "CME", name: "Education / Training", color: "#D9F99D", border_color: "transparent", text_color: "#3F6212" },
      { label: "FMLA", name: "Family / Medical Leave", color: "#FBCFE8", border_color: "transparent", text_color: "#9D174D" },
      { label: "UX", name: "Unpaid Leave", color: "#FED7AA", border_color: "transparent", text_color: "#9A3412" },
    ] as AbsenceTypeDef[],
    assignments: [
      { label: "Ofc", name: "Office", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_general: true, faIndex: null, catIndex: null },
      { label: "0.3", name: "Partial", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_general: true, faIndex: null, catIndex: null },
      { label: "D", name: "Day", color: "#BAE6FD", border_color: "transparent", text_color: "#075985", is_general: false, faIndex: 0, catIndex: 0, start: "07:00", end: "15:00" },
      { label: "E", name: "Evening", color: "#DDD6FE", border_color: "transparent", text_color: "#5B21B6", is_general: false, faIndex: 0, catIndex: 1, start: "15:00", end: "23:00" },
      { label: "N", name: "Night", color: "#FED7AA", border_color: "transparent", text_color: "#9A3412", is_general: false, faIndex: 0, catIndex: 2, start: "23:00", end: "07:00" },
      { label: "FV", name: "Field Visit", color: "#D9F99D", border_color: "transparent", text_color: "#3F6212", is_general: false, faIndex: 1, catIndex: 3, start: "08:00", end: "17:00" },
      { label: "SG", name: "Support Group", color: "#D9F99D", border_color: "transparent", text_color: "#3F6212", is_general: false, faIndex: 2, catIndex: 4, start: "10:00", end: "16:00" },
    ] as AssignmentDef[],
    employeeCount: 30,
    indicatorTypes: [
      { name: "Pain Assessment", color: "#E9D5FF" },
      { name: "Family Meeting", color: "#A7F3D0" },
      { name: "Comfort Care", color: "#FED7AA" },
    ],
  },
];

const EMPLOYEE_NAMES = [
  "Maria Garcia", "James Johnson", "Sarah Williams", "Robert Brown", "Jennifer Davis",
  "Michael Miller", "Lisa Wilson", "David Moore", "Jessica Taylor", "Thomas Anderson",
  "Amanda Martinez", "Christopher Robinson", "Ashley Clark", "Daniel Rodriguez", "Emily Lewis",
  "Matthew Lee", "Stephanie Walker", "Andrew Hall", "Nicole Allen", "Joshua Young",
  "Megan Hernandez", "Kevin King", "Rachel Wright", "Brian Lopez", "Lauren Hill",
  "Ryan Scott", "Samantha Green", "Justin Adams", "Heather Baker", "Brandon Nelson",
  "Amber Carter", "Tyler Mitchell", "Kayla Perez", "Jason Roberts", "Christina Turner",
  "Nathan Phillips", "Tiffany Campbell", "Eric Parker", "Melissa Evans", "Aaron Edwards",
  "Rebecca Collins", "Patrick Stewart", "Victoria Morgan", "Sean Murphy", "Hannah Cook",
  "Cody Rogers", "Catherine Reed", "Derek Bailey", "Danielle Rivera", "Travis Cooper",
  "Michelle Thomas", "Gregory Jackson", "Brittany White", "Keith Harris", "Diana Martin",
  "Frank Thompson", "Janet Robinson", "Gary Clark", "Susan Lewis", "Peter Lee",
  "Carol Walker", "George Young", "Donna Allen", "Timothy King", "Sandra Wright",
  "Kenneth Scott", "Dorothy Hill", "Steven Green", "Nancy Adams", "Edward Baker",
  "Carolyn Nelson", "Larry Carter", "Virginia Mitchell", "Raymond Perez", "Debra Roberts",
  "Jeffrey Turner", "Laura Phillips", "Raymond Campbell", "Judith Parker", "Albert Evans",
  "Helen Edwards", "Ralph Collins", "Gloria Stewart", "Louis Morgan", "Marie Murphy",
  "Russell Cook", "Beverly Rogers", "Wayne Reed", "Frances Bailey", "Adam Rivera",
  "Rose Cooper", "Eugene Thomas", "Patricia Jackson", "Henry White", "Martha Harris",
];

function dateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Helper: coerce pg bigint strings to number
function id(val: unknown): number {
  return Number(val);
}

interface ParsedSeedAddress {
  address: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
}

function parseUsSeedAddress(address: string): ParsedSeedAddress {
  const normalized = address.replace(/\s*\n\s*/g, ", ").trim();
  const match = normalized.match(
    /^(.*?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/,
  );

  if (!match) {
    throw new Error(`Unable to parse seed address: ${address}`);
  }

  const [, addressLine1, addressCity, addressState, addressPostalCode] = match;
  const addressCountry = "United States";

  return {
    address: `${addressLine1}, ${addressCity}, ${addressState} ${addressPostalCode}, ${addressCountry}`,
    addressLine1,
    addressLine2: "",
    addressCity,
    addressState,
    addressPostalCode,
    addressCountry,
  };
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
}

function normalizeSeedLookup(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(
    new Set(values.filter((value) => Number.isFinite(value))),
  ).sort((left, right) => left - right);
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPreferredJobAbbr(
  role: SeedRoleRow | null,
  fallback: string,
): string {
  const abbr = role?.abbr?.trim() ?? "";
  if (abbr.length > 0 && abbr.length <= 4) {
    return abbr;
  }
  return fallback;
}

function buildFallbackAbbr(value: string): string {
  const compact = value.replace(/[^A-Za-z0-9.]+/g, " ").trim();
  if (!compact) return "JOB";
  if (/^\d+(?:\.\d+)?$/.test(compact)) return compact;

  const parts = compact.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const single = parts[0];
    if (single.length <= 4) {
      return single.toUpperCase();
    }
    return single.slice(0, 3).toUpperCase();
  }

  return parts
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function findMatchingRoles(
  roles: SeedRoleRow[],
  aliases: string[],
): SeedRoleRow[] {
  const normalizedAliases = uniqueNormalizedAliases(aliases);
  if (normalizedAliases.length === 0) {
    return [];
  }

  return roles.filter((role) => {
    const name = normalizeSeedLookup(role.name);
    const abbr = normalizeSeedLookup(role.abbr);

    return normalizedAliases.some((alias) => {
      if (alias === name || alias === abbr) {
        return true;
      }

      return (
        alias.length >= 3 &&
        (name.includes(alias) ||
          alias.includes(name) ||
          abbr.includes(alias) ||
          alias.includes(abbr))
      );
    });
  });
}

function uniqueNormalizedAliases(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => normalizeSeedLookup(value)).filter(Boolean)),
  );
}

function resolveJobIdentity(
  rawDescriptor: string,
  roles: SeedRoleRow[],
): {
  name: string;
  abbr: string;
  eligibleRoleIds: number[];
} {
  const raw = rawDescriptor.trim();
  const normalized = normalizeSeedLookup(raw);

  const exactAbbrMatches = roles.filter(
    (role) => normalizeSeedLookup(role.abbr) === normalized,
  );
  if (exactAbbrMatches.length > 0) {
    const primary = exactAbbrMatches[0];
    return {
      name: primary.name,
      abbr: getPreferredJobAbbr(primary, buildFallbackAbbr(primary.name)),
      eligibleRoleIds: uniqueNumbers(exactAbbrMatches.map((role) => role.id)),
    };
  }

  if (
    normalized.includes("supervisor") ||
    normalized === "sup" ||
    normalized === "supv" ||
    normalized === "ss"
  ) {
    const matchedRoles = findMatchingRoles(roles, [
      "supervisor",
      "shift supervisor",
      "sup",
      "supv",
      "ss",
    ]);
    const primary = matchedRoles[0] ?? null;
    return {
      name: primary?.name ?? "Supervisor",
      abbr: getPreferredJobAbbr(primary, "S"),
      eligibleRoleIds: uniqueNumbers(matchedRoles.map((role) => role.id)),
    };
  }

  if (normalized.includes("mentor")) {
    const matchedRoles = findMatchingRoles(roles, ["mentor", "mentoring"]);
    const primary = matchedRoles[0] ?? null;
    return {
      name: primary?.name ?? "Mentor",
      abbr: getPreferredJobAbbr(primary, "M"),
      eligibleRoleIds: uniqueNumbers(matchedRoles.map((role) => role.id)),
    };
  }

  if (
    normalized === "cn" ||
    normalized.includes("charge nurse") ||
    normalized.includes("christian science nurse")
  ) {
    const matchedRoles = findMatchingRoles(roles, [
      "cn",
      "charge nurse",
      "christian science nurse",
    ]);
    const primary = matchedRoles[0] ?? null;
    return {
      name: primary?.name ?? "Charge Nurse",
      abbr: getPreferredJobAbbr(primary, "CN"),
      eligibleRoleIds: uniqueNumbers(matchedRoles.map((role) => role.id)),
    };
  }

  if (normalized === "office" || normalized === "ofc") {
    return { name: "Office", abbr: "Ofc", eligibleRoleIds: [] };
  }

  if (normalized === "partial" || normalized === "0 3") {
    return { name: "Partial", abbr: "0.3", eligibleRoleIds: [] };
  }

  const exactNameMatches = roles.filter(
    (role) => normalizeSeedLookup(role.name) === normalized,
  );
  if (exactNameMatches.length > 0) {
    const primary = exactNameMatches[0];
    return {
      name: primary.name,
      abbr: getPreferredJobAbbr(primary, buildFallbackAbbr(primary.name)),
      eligibleRoleIds: uniqueNumbers(exactNameMatches.map((role) => role.id)),
    };
  }

  const fuzzyMatches = findMatchingRoles(roles, [raw]);
  const title = toTitleCase(raw);
  return {
    name: title || raw,
    abbr: buildFallbackAbbr(title || raw),
    eligibleRoleIds: uniqueNumbers(fuzzyMatches.map((role) => role.id)),
  };
}

function deriveJobDescriptor(
  assignment: SeedAssignmentRow,
  shift: SeedShiftCategoryRow,
): string | null {
  const rawName = assignment.name.trim();
  if (!rawName) {
    return null;
  }

  let working = rawName;
  const shiftName = shift.name.trim();
  const shiftNameWithoutShift = shiftName
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bshift\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const removablePhrases = Array.from(
    new Set([shiftName, shiftNameWithoutShift].filter(Boolean)),
  );
  for (const phrase of removablePhrases) {
    working = working.replace(new RegExp(escapeRegExp(phrase), "ig"), " ");
  }

  const removableTokens = Array.from(
    new Set(
      shiftNameWithoutShift
        .split(/\s+/)
        .filter(Boolean)
        .concat("shift"),
    ),
  );
  for (const token of removableTokens) {
    working = working.replace(
      new RegExp(`\\b${escapeRegExp(token)}\\b`, "ig"),
      " ",
    );
  }

  working = working
    .replace(/[()[\]/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const normalizedWorking = normalizeSeedLookup(working);
  if (!normalizedWorking) {
    return null;
  }

  const normalizedShiftName = normalizeSeedLookup(shiftName);
  const normalizedShiftBase = normalizeSeedLookup(shiftNameWithoutShift);
  if (
    normalizedWorking === normalizedShiftName ||
    normalizedWorking === normalizedShiftBase
  ) {
    return null;
  }

  return working;
}

function selectBaseAssignment(
  codes: SeedAssignmentRow[],
  shift: SeedShiftCategoryRow,
): SeedAssignmentRow {
  const baseCandidates = codes.filter(
    (code) => deriveJobDescriptor(code, shift) == null,
  );

  return [...(baseCandidates.length > 0 ? baseCandidates : codes)].sort(
    (left, right) => {
      if (left.sort_order !== right.sort_order) {
        return left.sort_order - right.sort_order;
      }
      if (left.label.length !== right.label.length) {
        return left.label.length - right.label.length;
      }
      return left.id - right.id;
    },
  )[0];
}

async function writePublishedWorkScheduleCellsBatch(
  db: Client,
  orgId: string,
  cells: Array<{
    empId: string;
    date: string;
    shiftIds: Array<number | null>;
    jobIds: number[];
    focusAreaId: number | null;
  }>,
): Promise<void> {
  if (cells.length === 0) return;
  const payload = JSON.stringify(
    cells.map((c) => ({
      emp_id: c.empId,
      dt: c.date,
      shift_ids: c.shiftIds,
      job_ids: c.jobIds,
      focus_area_id: c.focusAreaId,
    })),
  );
  await db.query(
    `SELECT public.write_schedule_cell_snapshot_internal(
       $1::uuid, x.emp_id, x.dt, 'published', 'worked',
       COALESCE(x.shift_ids, '{}'::bigint[]),
       COALESCE(x.job_ids, '{}'::bigint[]),
       NULL, NULL, NULL, NULL, false, x.focus_area_id, NULL, NULL
     )
     FROM jsonb_to_recordset($2::jsonb) AS x(
       emp_id uuid, dt date, shift_ids bigint[], job_ids bigint[], focus_area_id bigint
     )`,
    [orgId, payload],
  );
}

async function writePublishedAbsenceScheduleCellsBatch(
  db: Client,
  orgId: string,
  cells: Array<{ empId: string; date: string; absenceTypeId: number }>,
): Promise<void> {
  if (cells.length === 0) return;
  const payload = JSON.stringify(
    cells.map((c) => ({
      emp_id: c.empId,
      dt: c.date,
      absence_type_id: c.absenceTypeId,
    })),
  );
  await db.query(
    `SELECT public.write_schedule_cell_snapshot_internal(
       $1::uuid, x.emp_id, x.dt, 'published', 'absence',
       '{}'::bigint[], '{}'::bigint[], x.absence_type_id,
       NULL, NULL, NULL, false, NULL, NULL, NULL
     )
     FROM jsonb_to_recordset($2::jsonb) AS x(
       emp_id uuid, dt date, absence_type_id bigint
     )`,
    [orgId, payload],
  );
}

function splitSqlBeforeFinalScheduleBlock(sql: string): {
  prefixSql: string;
  scheduleSql: string;
} {
  const doBlockMatches = [...sql.matchAll(/^DO \$\$/gm)];
  const lastDoIndex = doBlockMatches.at(-1)?.index;

  if (lastDoIndex == null) {
    throw new Error("Expected at least one DO block in tenant SQL seed file");
  }

  const prefixSql = sql.slice(0, lastDoIndex).trim();
  const scheduleSql = sql.slice(lastDoIndex).trim();

  if (!scheduleSql.includes("write_schedule_cell_snapshot_internal")) {
    throw new Error(
      "Expected final DO block in tenant SQL seed file to seed schedule cells",
    );
  }

  return { prefixSql, scheduleSql };
}

async function seedTenantSqlBeforeSchedule(
  db: Client,
  sqlPath: string,
  orgId: string,
): Promise<{
  totalJobCount: number;
  scheduledJobCount: number;
  shiftlessJobCount: number;
}> {
  const tenantSql = readFileSync(sqlPath, "utf8");
  const { prefixSql, scheduleSql } = splitSqlBeforeFinalScheduleBlock(tenantSql);

  if (prefixSql) {
    await db.query(prefixSql);
  }

  if (scheduleSql) {
    await db.query(scheduleSql);
  }

  const { rows: [counts] } = await db.query(
    `SELECT
       COUNT(*)::int AS total_job_count,
       COUNT(*) FILTER (WHERE assignment_mode = 'with_shift')::int AS scheduled_job_count,
       COUNT(*) FILTER (WHERE assignment_mode = 'shiftless')::int AS shiftless_job_count
     FROM public.jobs
     WHERE org_id = $1 AND archived_at IS NULL`,
    [orgId],
  );

  return {
    totalJobCount: Number(counts?.total_job_count ?? 0),
    scheduledJobCount: Number(counts?.scheduled_job_count ?? 0),
    shiftlessJobCount: Number(counts?.shiftless_job_count ?? 0),
  };
}

async function seedJobsForOrg(
  db: Client,
  orgId: string,
  assignmentDefinitions: SeedAssignmentRow[],
): Promise<{
  totalJobCount: number;
  scheduledJobCount: number;
  shiftlessJobCount: number;
  resolvedAssignments: ResolvedSeedAssignmentRow[];
}> {
  const { rows: rawRoles } = await db.query(
    `SELECT id, name, abbr
     FROM public.organization_roles
     WHERE org_id = $1 AND archived_at IS NULL AND COALESCE(is_schedule_role, true) = true
     ORDER BY sort_order, id`,
    [orgId],
  );
  const roles: SeedRoleRow[] = rawRoles.map((row) => ({
    id: id(row.id),
    name: row.name,
    abbr: row.abbr,
  }));

  const { rows: rawFocusAreas } = await db.query(
    `SELECT id, department_id, color
     FROM public.focus_areas
     WHERE org_id = $1 AND archived_at IS NULL`,
    [orgId],
  );
  const focusAreas: SeedFocusAreaRow[] = rawFocusAreas.map((row) => ({
    id: id(row.id),
    department_id: row.department_id != null ? id(row.department_id) : null,
    color: row.color ?? null,
  }));
  const focusAreaDepartmentById = new Map(
    focusAreas.map((focusArea) => [focusArea.id, focusArea.department_id]),
  );
  const focusAreaIdsByDepartmentId = new Map<number, number[]>();
  for (const focusArea of focusAreas) {
    if (focusArea.department_id == null) continue;
    const existing = focusAreaIdsByDepartmentId.get(focusArea.department_id) ?? [];
    existing.push(focusArea.id);
    focusAreaIdsByDepartmentId.set(focusArea.department_id, existing);
  }

  const { rows: rawShiftCategories } = await db.query(
    `SELECT id, name, abbr, start_time, end_time, color, sort_order, focus_area_id
     FROM public.shift_categories
     WHERE org_id = $1 AND archived_at IS NULL
     ORDER BY sort_order, id`,
    [orgId],
  );
  const shiftCategories: SeedShiftCategoryRow[] = rawShiftCategories.map((row) => ({
    id: id(row.id),
    name: row.name,
    abbr: row.abbr ?? null,
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    color: row.color ?? DEFAULT_JOB_PRESET.bg,
    sort_order: row.sort_order,
    focus_area_id: row.focus_area_id != null ? id(row.focus_area_id) : null,
  }));
  const shiftIdsByFocusAreaId = new Map<number, number[]>();
  for (const shift of shiftCategories) {
    if (shift.focus_area_id == null) continue;
    const existing = shiftIdsByFocusAreaId.get(shift.focus_area_id) ?? [];
    existing.push(shift.id);
    shiftIdsByFocusAreaId.set(shift.focus_area_id, existing);
  }

  const assignments = [...assignmentDefinitions].sort(
    (left, right) => left.sort_order - right.sort_order || left.id - right.id,
  );

  await db.query(`DELETE FROM public.jobs WHERE org_id = $1`, [orgId]);

  const shiftById = new Map(shiftCategories.map((shift) => [shift.id, shift]));
  const codesByShiftId = new Map<number, SeedAssignmentRow[]>();
  for (const code of assignments) {
    if (code.category_id == null || code.is_general) continue;
    const existing = codesByShiftId.get(code.category_id) ?? [];
    existing.push(code);
    codesByShiftId.set(code.category_id, existing);
  }

  const assignmentJobKeys = new Map<number, string>();
  const assignmentShiftIds = new Map<number, number | null>();
  const shiftAbbrUpdates = new Map<number, string>();
  const scheduledJobMap = new Map<string, DerivedJobSeed>();
  const shiftlessJobMap = new Map<string, DerivedJobSeed>();

  for (const shift of shiftCategories) {
    const group = [...(codesByShiftId.get(shift.id) ?? [])].sort(
      (left, right) => left.sort_order - right.sort_order || left.id - right.id,
    );
    if (group.length === 0) continue;

    const baseCode = selectBaseAssignment(group, shift);
    const baseIdentity = resolveJobIdentity("Staff", roles);
    const baseJobKey = `scheduled:${normalizeSeedLookup(baseIdentity.name)}`;
    shiftAbbrUpdates.set(shift.id, baseCode.label);

    for (const code of group) {
      assignmentShiftIds.set(code.id, shift.id);
      const descriptor = deriveJobDescriptor(code, shift);
      const identity =
        code.id === baseCode.id || group.length === 1 || !descriptor
          ? baseIdentity
          : resolveJobIdentity(descriptor, roles);
      const key =
        code.id === baseCode.id || group.length === 1 || !descriptor
          ? baseJobKey
          : `scheduled:${normalizeSeedLookup(identity.name)}`;
      const existing = scheduledJobMap.get(key);
      const shiftDepartmentId =
        shift.focus_area_id != null
          ? focusAreaDepartmentById.get(shift.focus_area_id) ?? null
          : null;
      const nextTimeOverride = deriveShiftTimeOverride(code, shift);
      if (existing) {
        existing.focus_area_ids = uniqueNumbers(
          existing.focus_area_ids.concat(
            shift.focus_area_id != null ? [shift.focus_area_id] : [],
          ),
        );
        existing.department_ids = uniqueNumbers(
          existing.department_ids.concat(
            shiftDepartmentId != null ? [shiftDepartmentId] : [],
          ),
        );
        existing.applicable_shift_ids = uniqueNumbers(
          existing.applicable_shift_ids.concat(shift.id),
        );
        existing.eligible_role_ids = uniqueNumbers(
          existing.eligible_role_ids.concat(identity.eligibleRoleIds),
        );
        existing.required_certification_ids = uniqueNumbers(
          existing.required_certification_ids.concat(
            code.required_certification_ids,
          ),
        );
        if (nextTimeOverride) {
          existing.shift_time_overrides[String(shift.id)] = nextTimeOverride;
        }
        existing.sort_order = Math.min(existing.sort_order, code.sort_order);
      } else {
        scheduledJobMap.set(key, {
          key,
          name: identity.name,
          abbr: identity.abbr,
          show_on_grid: code.id !== baseCode.id,
          assignment_mode: "with_shift",
          eligibility_mode: "and",
          focus_area_ids: shift.focus_area_id != null ? [shift.focus_area_id] : [],
          department_ids: shiftDepartmentId != null ? [shiftDepartmentId] : [],
          applicable_shift_ids: [shift.id],
          eligible_role_ids: identity.eligibleRoleIds,
          required_certification_ids: uniqueNumbers(
            code.required_certification_ids,
          ),
          color: "#E2E8F0",
          border_color: "transparent",
          text_color: "#1E293B",
          shift_time_overrides:
            nextTimeOverride != null ? { [String(shift.id)]: nextTimeOverride } : {},
          shift_color_overrides: {},
          default_start_time: null,
          default_end_time: null,
          default_duration_hours: null,
          default_duration_minutes: null,
          sort_order: code.sort_order,
          system_key: null,
        });
      }

      assignmentJobKeys.set(code.id, key);
    }
  }

  for (const code of assignments) {
    if (!code.is_general && code.category_id != null) {
      continue;
    }

    const identity = resolveJobIdentity(code.name || code.label, roles);
    const key = `shiftless:${normalizeSeedLookup(identity.name)}`;
    const existing = shiftlessJobMap.get(key);
    if (existing) {
      existing.eligible_role_ids = uniqueNumbers(
        existing.eligible_role_ids.concat(identity.eligibleRoleIds),
      );
      existing.required_certification_ids = uniqueNumbers(
        existing.required_certification_ids.concat(
          code.required_certification_ids,
        ),
      );
      existing.sort_order = Math.min(existing.sort_order, code.sort_order);
      existing.default_start_time =
        existing.default_start_time ?? code.default_start_time;
      existing.default_end_time =
        existing.default_end_time ?? code.default_end_time;
      existing.default_duration_hours =
        existing.default_duration_hours ?? code.default_duration_hours;
      existing.default_duration_minutes =
        existing.default_duration_minutes ?? code.default_duration_minutes;
    } else {
      shiftlessJobMap.set(key, {
        key,
        name: identity.name,
        abbr: identity.abbr,
        show_on_grid: true,
        assignment_mode: "shiftless",
        eligibility_mode: "and",
        focus_area_ids: [],
        department_ids: [],
        applicable_shift_ids: [],
        eligible_role_ids: identity.eligibleRoleIds,
        required_certification_ids: uniqueNumbers(
          code.required_certification_ids,
        ),
        color: code.color,
        border_color: code.border_color,
        text_color: code.text_color,
        shift_time_overrides: {},
        shift_color_overrides: {},
        default_start_time: code.default_start_time,
        default_end_time: code.default_end_time,
        default_duration_hours: code.default_duration_hours,
        default_duration_minutes: code.default_duration_minutes,
        sort_order: code.sort_order,
        system_key: null,
      });
    }

    assignmentShiftIds.set(code.id, null);
    assignmentJobKeys.set(code.id, key);
  }

  const scheduledJobs = [...scheduledJobMap.values()].sort((left, right) => {
    const leftFocusAreaId = left.focus_area_ids[0] ?? 0;
    const rightFocusAreaId = right.focus_area_ids[0] ?? 0;
    if (leftFocusAreaId !== rightFocusAreaId) {
      return leftFocusAreaId - rightFocusAreaId;
    }
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }
    return left.name.localeCompare(right.name);
  });
  for (const job of scheduledJobs) {
    job.department_ids = uniqueNumbers(
      job.department_ids.concat(
        job.focus_area_ids
          .map((focusAreaId) => focusAreaDepartmentById.get(focusAreaId))
          .filter((departmentId): departmentId is number => departmentId != null),
      ),
    );

    const placementFocusAreaIds =
      job.focus_area_ids.length > 0
        ? job.focus_area_ids
        : uniqueNumbers(
            job.department_ids.flatMap(
              (departmentId) => focusAreaIdsByDepartmentId.get(departmentId) ?? [],
            ),
          );
    const placementShiftIds = uniqueNumbers(
      placementFocusAreaIds.flatMap(
        (focusAreaId) => shiftIdsByFocusAreaId.get(focusAreaId) ?? [],
      ),
    );

  }
  const shiftlessJobs = [...shiftlessJobMap.values()].sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }
    return left.name.localeCompare(right.name);
  });

  const orderedJobs: DerivedJobSeed[] = [...scheduledJobs, ...shiftlessJobs].map((job, index) => ({
    ...job,
    sort_order: index,
  }));

  const jobIdByKey = new Map<string, number>();
  if (orderedJobs.length > 0) {
    const jobSeeds = orderedJobs.map((job) => ({
      key: job.key,
      name: job.name,
      abbr: job.abbr,
      show_on_grid: job.show_on_grid,
      assignment_mode: job.assignment_mode,
      eligibility_mode: job.eligibility_mode,
      focus_area_ids: job.focus_area_ids,
      department_ids: job.department_ids,
      applicable_shift_ids: job.applicable_shift_ids,
      eligible_role_ids: job.eligible_role_ids,
      required_certification_ids: job.required_certification_ids,
      color: job.color,
      border_color: job.border_color,
      text_color: job.text_color,
      shift_time_overrides: job.shift_time_overrides,
      shift_color_overrides: job.shift_color_overrides,
      default_start_time: job.default_start_time,
      default_end_time: job.default_end_time,
      default_duration_hours: job.default_duration_hours,
      default_duration_minutes: job.default_duration_minutes,
      sort_order: job.sort_order,
      system_key: job.system_key,
    }));
    const { rows } = await db.query(
      `WITH input AS (
         SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(
           key text, name text, abbr text, show_on_grid boolean,
           assignment_mode text, eligibility_mode text,
           focus_area_ids bigint[], department_ids bigint[],
           applicable_shift_ids bigint[], eligible_role_ids bigint[],
           required_certification_ids bigint[],
           color text, border_color text, text_color text,
           shift_time_overrides jsonb, shift_color_overrides jsonb,
           default_start_time time, default_end_time time,
           default_duration_hours smallint, default_duration_minutes smallint,
           sort_order int, system_key text
         )
       ),
       inserted AS (
         INSERT INTO public.jobs (
           org_id, name, abbr, show_on_grid, assignment_mode, eligibility_mode,
           focus_area_ids, department_ids, applicable_shift_ids,
           eligible_role_ids, required_certification_ids,
           color, border_color, text_color,
           shift_time_overrides, shift_color_overrides,
           default_start_time, default_end_time,
           default_duration_hours, default_duration_minutes,
           sort_order, system_key
         )
         SELECT $1, name, abbr, show_on_grid, assignment_mode, eligibility_mode,
                focus_area_ids, department_ids, applicable_shift_ids,
                eligible_role_ids, required_certification_ids,
                color, border_color, text_color,
                shift_time_overrides, shift_color_overrides,
                default_start_time, default_end_time,
                default_duration_hours, default_duration_minutes,
                sort_order, system_key
         FROM input
         RETURNING id, sort_order
       )
       SELECT i.id, inp.key
       FROM inserted i
       JOIN input inp ON inp.sort_order = i.sort_order
       ORDER BY inp.sort_order`,
      [orgId, JSON.stringify(jobSeeds)],
    );
    for (const row of rows) {
      jobIdByKey.set(row.key, id(row.id));
    }
  }

  const shiftAbbrUpdatesToApply: Array<{ shift_id: number; abbr: string }> = [];
  for (const [shiftId, abbr] of shiftAbbrUpdates) {
    const shift = shiftById.get(shiftId);
    if (shift?.abbr?.trim()) continue;
    shiftAbbrUpdatesToApply.push({ shift_id: shiftId, abbr });
  }
  if (shiftAbbrUpdatesToApply.length > 0) {
    await db.query(
      `UPDATE public.shift_categories sc
       SET abbr = u.abbr
       FROM jsonb_to_recordset($1::jsonb) AS u(shift_id bigint, abbr text)
       WHERE sc.id = u.shift_id`,
      [JSON.stringify(shiftAbbrUpdatesToApply)],
    );
  }

  const resolvedAssignments: ResolvedSeedAssignmentRow[] = [];
  for (const code of assignments) {
    const jobKey = assignmentJobKeys.get(code.id);
    if (!jobKey) {
      throw new Error(`Unable to resolve seeded job key for assignment ${code.id}`);
    }
    const jobId = jobIdByKey.get(jobKey);
    if (jobId == null) {
      throw new Error(`Unable to resolve seeded job for assignment ${code.id}`);
    }
    resolvedAssignments.push({
      label: code.label,
      focus_area_id: code.focus_area_id,
      shift_id: assignmentShiftIds.get(code.id) ?? null,
      job_id: jobId,
      sort_order: code.sort_order,
    });
  }

  return {
    totalJobCount: orderedJobs.length,
    scheduledJobCount: scheduledJobs.length,
    shiftlessJobCount: shiftlessJobs.length,
    resolvedAssignments,
  };
}

async function main() {
  let connectionString: string;

  if (process.env.FORCE_LOCAL_DB === "1") {
    // Explicitly forced local (from npm run db:reset)
    connectionString = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    console.log("Connecting to LOCAL Supabase...\n");
  } else if (process.env.DATABASE_URL) {
    connectionString = process.env.DATABASE_URL;
  } else if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("supabase.co")) {
    // Remote Supabase — derive pooler connection string from project ref
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
    const password = process.env.SUPABASE_DB_PASSWORD;
    if (!password) {
      console.error("ERROR: SUPABASE_DB_PASSWORD not found for remote DB.");
      console.error("Ensure it's set in Vercel env vars, or use `npm run db:reset:remote` which handles this automatically.");
      process.exit(1);
    }
    connectionString = `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
    console.log(`Connecting to REMOTE Supabase (${ref})...\n`);
  } else {
    connectionString = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    console.log("Connecting to LOCAL Supabase...\n");
  }

  const ssl = connectionString.includes("supabase") ? { rejectUnauthorized: false } : undefined;
  const db = new Client({ connectionString, ssl });
  await db.connect();

  // ── Cleanup ────────────────────────────────────────────────────────────
  console.log("Clearing existing seed data...");
  await db.query(`
    DO $$ BEGIN
      TRUNCATE
        public.organization_memberships,
        public.schedule_notes,
        public.schedule_cell_segments,
        public.schedule_cell_snapshots,
        public.schedule_cells,
        public.recurring_shifts,
        public.shift_series,
        public.schedule_draft_sessions,
        public.recurring_shifts_draft_sessions,
        public.publish_history,
        public.employees,
        public.jobs,
        public.shift_categories,
        public.indicator_types,
        public.organization_roles,
        public.certifications,
        public.focus_areas,
        public.departments
      CASCADE;
      DELETE FROM public.organizations
      WHERE slug IN ('sunrise-senior', 'harbor-health', 'evergreen-care', 'pacific-wellness', 'mountain-view', 'calmhaven', 'ardenwood');
    EXCEPTION WHEN undefined_table THEN
      NULL; -- Tables don't exist yet on first run
    END $$;
  `);

  console.log("Seeding 7 tenants...\n");
  let globalNameIdx = 0;

  for (let t = 0; t < TENANTS.length; t++) {
    const tenant = TENANTS[t];
    console.log(`  [${t + 1}/7] ${tenant.name}...`);

    // 1. Organization
    const addressFields = parseUsSeedAddress(tenant.address);
    const { rows: [org] } = await db.query(
      `INSERT INTO public.organizations (
         name,
         slug,
         address,
         address_line_1,
         address_line_2,
         address_city,
         address_state,
         address_postal_code,
         address_country,
         phone,
         timezone,
         focus_area_label,
         certification_label,
         role_label,
         department_label,
         employee_count
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING id`,
      [
        tenant.name,
        tenant.slug,
        addressFields.address,
        addressFields.addressLine1,
        addressFields.addressLine2,
        addressFields.addressCity,
        addressFields.addressState,
        addressFields.addressPostalCode,
        addressFields.addressCountry,
        tenant.phone,
        tenant.timezone,
        tenant.focus_area_label,
        tenant.certification_label,
        tenant.role_label,
        "Scheduled Departments",
        tenant.employeeCount,
      ]
    );
    const orgId: string = org.id;

    // 2. Departments
    const deptIds: number[] = [];
    if (tenant.departments && tenant.departments.length > 0) {
      const deptSeeds = tenant.departments.map((dept, i) => ({
        name: dept.name,
        abbr: ((dept as { abbr?: string }).abbr ?? "").trim() || deriveSeedAbbr(dept.name, "DEPT"),
        type: dept.type,
        sort_order: i,
        permissions: dept.permissions ?? null,
      }));
      const { rows } = await db.query(
        `WITH inserted AS (
           INSERT INTO public.departments (org_id, name, abbr, type, sort_order, permissions)
           SELECT $1, name, abbr, type::department_type, sort_order, permissions
           FROM jsonb_to_recordset($2::jsonb) AS x(
             name text, abbr text, type text, sort_order int, permissions jsonb
           )
           RETURNING id, sort_order
         )
         SELECT id FROM inserted ORDER BY sort_order`,
        [orgId, JSON.stringify(deptSeeds)],
      );
      for (const row of rows) deptIds.push(id(row.id));
    }

    // 3. Focus Areas
    const focusAreaIds: number[] = [];
    if (tenant.focusAreas.length > 0) {
      const faSeeds = tenant.focusAreas.map((fa, i) => ({
        department_id: tenant.focusAreaDeptIndex?.[i] != null
          ? deptIds[tenant.focusAreaDeptIndex[i]]
          : null,
        name: fa.name,
        color: FOCUS_AREA_PRESET_COLORS[i % FOCUS_AREA_PRESET_COLORS.length],
        sort_order: i,
      }));
      const { rows } = await db.query(
        `WITH inserted AS (
           INSERT INTO public.focus_areas (org_id, department_id, name, color, sort_order)
           SELECT $1, department_id, name, color, sort_order
           FROM jsonb_to_recordset($2::jsonb) AS x(
             department_id bigint, name text, color text, sort_order int
           )
           RETURNING id, sort_order
         )
         SELECT id FROM inserted ORDER BY sort_order`,
        [orgId, JSON.stringify(faSeeds)],
      );
      for (const row of rows) focusAreaIds.push(id(row.id));
    }

    // 4. Certifications
    const certIds: number[] = [];
    if (tenant.certifications.length > 0) {
      const certSeeds = tenant.certifications.map((c, i) => ({
        department_id: c.deptIndex != null ? deptIds[c.deptIndex] : null,
        name: c.name,
        abbr: c.abbr,
        sort_order: i,
      }));
      const { rows } = await db.query(
        `WITH inserted AS (
           INSERT INTO public.certifications (org_id, department_id, name, abbr, sort_order)
           SELECT $1, department_id, name, abbr, sort_order
           FROM jsonb_to_recordset($2::jsonb) AS x(
             department_id bigint, name text, abbr text, sort_order int
           )
           RETURNING id, sort_order
         )
         SELECT id FROM inserted ORDER BY sort_order`,
        [orgId, JSON.stringify(certSeeds)],
      );
      for (const row of rows) certIds.push(id(row.id));
    }

    // 5. Organization Roles
    const roleIds: number[] = [];
    if (tenant.orgRoles.length > 0) {
      const roleSeeds = tenant.orgRoles.map((r, i) => ({
        department_id: r.deptIndex != null ? deptIds[r.deptIndex] : null,
        name: r.name,
        abbr: r.abbr,
        is_schedule_role: (r as { isScheduleRole?: boolean }).isScheduleRole ?? true,
        sort_order: i,
      }));
      const { rows } = await db.query(
        `WITH inserted AS (
           INSERT INTO public.organization_roles (org_id, department_id, name, abbr, is_schedule_role, sort_order)
           SELECT $1, department_id, name, abbr, is_schedule_role, sort_order
           FROM jsonb_to_recordset($2::jsonb) AS x(
             department_id bigint, name text, abbr text, is_schedule_role boolean, sort_order int
           )
           RETURNING id, sort_order
         )
         SELECT id FROM inserted ORDER BY sort_order`,
        [orgId, JSON.stringify(roleSeeds)],
      );
      for (const row of rows) roleIds.push(id(row.id));
    }

    // 6. Shift Categories
    // Codes are unique per (org, focus_area). Same code may repeat across
    // different focus areas (e.g. "D" for Day Shift in each area). Within a
    // focus area, suffix with a counter on collision as a last-resort guard.
    const catIds: number[] = [];
    if (tenant.shiftCategories.length > 0) {
      const usedAbbrsByArea = new Map<number | null, Set<string>>();
      const catSeeds = tenant.shiftCategories.map((cat, i) => {
        const faId = cat.faIndex !== null ? focusAreaIds[cat.faIndex] : null;
        const baseAbbr = (
          ((cat as { abbr?: string }).abbr ?? "").trim() ||
          deriveSeedAbbr(cat.name, "SHF")
        ).toUpperCase();
        const areaKey: number | null = faId ?? null;
        let usedInArea = usedAbbrsByArea.get(areaKey);
        if (!usedInArea) {
          usedInArea = new Set<string>();
          usedAbbrsByArea.set(areaKey, usedInArea);
        }
        let catAbbr = baseAbbr;
        let suffix = 2;
        while (usedInArea.has(catAbbr)) {
          catAbbr = `${baseAbbr}${suffix}`.slice(0, 8);
          suffix++;
        }
        usedInArea.add(catAbbr);
        const catBreakMinutes = (cat as { break_minutes?: number | null }).break_minutes ?? null;
        const catColor =
          tenant.assignments.find((assignment) => assignment.catIndex === i && !assignment.is_general)?.color ??
          DEFAULT_JOB_PRESET.bg;
        return {
          name: cat.name,
          abbr: catAbbr,
          start_time: cat.start_time,
          end_time: cat.end_time,
          color: catColor,
          sort_order: i,
          focus_area_id: faId,
          break_minutes: catBreakMinutes,
        };
      });
      const { rows } = await db.query(
        `WITH inserted AS (
           INSERT INTO public.shift_categories
             (org_id, name, abbr, start_time, end_time, color, sort_order, focus_area_id, break_minutes)
           SELECT $1, name, abbr, start_time, end_time, color, sort_order, focus_area_id, break_minutes
           FROM jsonb_to_recordset($2::jsonb) AS x(
             name text, abbr text, start_time time, end_time time, color text,
             sort_order int, focus_area_id bigint, break_minutes int
           )
           RETURNING id, sort_order
         )
         SELECT id FROM inserted ORDER BY sort_order`,
        [orgId, JSON.stringify(catSeeds)],
      );
      for (const row of rows) catIds.push(id(row.id));
    }

    // 7a. Absence Types
    interface AbsenceTypeRow { id: number; label: string }
    const absenceTypeRows: AbsenceTypeRow[] = [];
    if (tenant.absenceTypes.length > 0) {
      const absenceSeeds = tenant.absenceTypes.map((at, i) => ({
        label: at.label,
        name: at.name,
        color: at.color,
        border_color: at.border_color,
        text_color: at.text_color,
        sort_order: i,
      }));
      const { rows } = await db.query(
        `WITH inserted AS (
           INSERT INTO public.absence_types
             (org_id, label, name, color, border_color, text_color, sort_order)
           SELECT $1, label, name, color, border_color, text_color, sort_order
           FROM jsonb_to_recordset($2::jsonb) AS x(
             label text, name text, color text, border_color text, text_color text, sort_order int
           )
           RETURNING id, label, sort_order
         )
         SELECT id, label FROM inserted ORDER BY sort_order`,
        [orgId, JSON.stringify(absenceSeeds)],
      );
      for (const row of rows) {
        absenceTypeRows.push({ id: id(row.id), label: row.label });
      }
    }

    const assignmentRows: SeedAssignmentRow[] = tenant.assignments.map((assignment, index) => ({
      id: index,
      label: assignment.label,
      name: assignment.name,
      color: assignment.color,
      border_color: assignment.border_color,
      text_color: assignment.text_color,
      is_general: assignment.is_general,
      focus_area_id:
        assignment.faIndex !== null ? focusAreaIds[assignment.faIndex] : null,
      category_id:
        assignment.catIndex !== null ? catIds[assignment.catIndex] : null,
      sort_order: index,
      default_start_time: assignment.start ?? null,
      default_end_time: assignment.end ?? null,
      default_duration_hours: null,
      default_duration_minutes: null,
      required_certification_ids: [],
    }));

    // 8. Indicator Types
    if (tenant.indicatorTypes.length > 0) {
      const indSeeds = tenant.indicatorTypes.map((it, i) => ({
        name: it.name,
        color: it.color,
        sort_order: i,
      }));
      await db.query(
        `INSERT INTO public.indicator_types (org_id, name, color, sort_order)
         SELECT $1, name, color, sort_order
         FROM jsonb_to_recordset($2::jsonb) AS x(name text, color text, sort_order int)`,
        [orgId, JSON.stringify(indSeeds)],
      );
    }

    // 9. Employees — spread across focus areas
    const empNames: string[] = [];
    for (let i = 0; i < tenant.employeeCount; i++) {
      empNames.push(EMPLOYEE_NAMES[globalNameIdx % EMPLOYEE_NAMES.length]);
      globalNameIdx++;
    }

    interface EmpRow { id: string; focus_area_ids: number[]; status: string }
    interface EmpSeed {
      first_name: string;
      last_name: string;
      seniority: number;
      phone: string;
      email: string;
      certification_id: number;
      role_ids: number[];
      focus_area_ids: number[];
      status: string;
    }
    const empSeeds: EmpSeed[] = empNames.map((fullName, i) => {
      const nameParts = fullName.split(" ");
      const lastName = nameParts.pop()!;
      const firstName = nameParts.join(" ") || lastName;
      const certId = certIds[i % certIds.length];
      const primaryFaIdx = i % focusAreaIds.length;
      const empFaIds = [focusAreaIds[primaryFaIdx]];
      if (i % 3 === 0 && focusAreaIds.length > 1) {
        empFaIds.push(focusAreaIds[(primaryFaIdx + 1) % focusAreaIds.length]);
      }
      const empRoleIds = i % 4 === 0 ? [roleIds[i % roleIds.length]] : [];
      const status = i < empNames.length - 2 ? "active" : i === empNames.length - 2 ? "benched" : "terminated";
      return {
        first_name: firstName,
        last_name: lastName,
        seniority: empNames.length - i,
        phone: copycat.phoneNumber(`${tenant.slug}-${fullName}-${i}`),
        email: copycat.email(`${tenant.slug}-${fullName}-${i}`),
        certification_id: certId,
        role_ids: empRoleIds,
        focus_area_ids: empFaIds,
        status,
      };
    });

    const employees: EmpRow[] = [];
    if (empSeeds.length > 0) {
      const { rows: empRows } = await db.query(
        `WITH input AS (
           SELECT *, (row_number() OVER ())::int AS ord
           FROM jsonb_to_recordset($2::jsonb) AS x(
             first_name text, last_name text, seniority int, phone text, email text,
             certification_id bigint, role_ids bigint[], focus_area_ids bigint[], status text
           )
         ),
         inserted AS (
           INSERT INTO public.employees
             (org_id, first_name, last_name, seniority, phone, email, contact_notes,
              certification_id, role_ids, focus_area_ids, status, status_note)
           SELECT $1, first_name, last_name, seniority, phone, email, '',
                  certification_id, role_ids, focus_area_ids, status::employee_status, ''
           FROM input
           RETURNING id, first_name, last_name, seniority, focus_area_ids, status
         )
         SELECT i.id, i.focus_area_ids, i.status
         FROM inserted i
         JOIN input inp
           ON inp.first_name = i.first_name
          AND inp.last_name = i.last_name
          AND inp.seniority = i.seniority
         ORDER BY inp.ord`,
        [orgId, JSON.stringify(empSeeds)],
      );
      for (const row of empRows) {
        employees.push({
          id: row.id,
          focus_area_ids: (row.focus_area_ids ?? []).map(id),
          status: row.status,
        });
      }
    }

    // 9b. Assign ~20% of employees to management departments
    // Every 5th employee gets a mgmt dept. First of each pair is a dept admin, rest are users.
    const mgmtDeptIds = deptIds.filter((_, idx) => tenant.departments?.[idx]?.type === 'management');
    if (mgmtDeptIds.length > 0) {
      const mgmtUpdates: Array<{ emp_id: string; dept_ids: number[]; admin_ids: number[] }> = [];
      let adminToggle = true;
      for (let i = 0; i < employees.length; i++) {
        if (i % 5 === 0) {
          const mgmtId = mgmtDeptIds[i % mgmtDeptIds.length];
          mgmtUpdates.push({
            emp_id: employees[i].id,
            dept_ids: [mgmtId],
            admin_ids: adminToggle ? [mgmtId] : [],
          });
          adminToggle = !adminToggle;
        }
      }
      if (mgmtUpdates.length > 0) {
        await db.query(
          `UPDATE public.employees e
           SET department_ids = u.dept_ids,
               dept_admin_ids = u.admin_ids
           FROM jsonb_to_recordset($1::jsonb) AS u(emp_id uuid, dept_ids bigint[], admin_ids bigint[])
           WHERE e.id = u.emp_id`,
          [JSON.stringify(mgmtUpdates)],
        );
      }
    }

    const seededJobs = await seedJobsForOrg(db, orgId, assignmentRows);

    // 10. Schedule cells (April 19 – May 2, 2026 — 2 weeks of data)
    const offAbsenceType = absenceTypeRows[0]; // First absence type (e.g., "Off")
    let shiftCount = 0;

    const workShiftValues: Array<{
      empId: string;
      date: string;
      shiftIds: Array<number | null>;
      jobIds: number[];
      focusAreaId: number | null;
    }> = [];
    const absenceValues: Array<{
      empId: string;
      date: string;
      absenceTypeId: number;
    }> = [];

    for (const emp of employees) {
      if (emp.status === "terminated") continue;
      const primaryFaId = emp.focus_area_ids[0] ?? null;
      const empWorkAssignments = seededJobs.resolvedAssignments.filter(
        (assignment) =>
          assignment.focus_area_id === primaryFaId ||
          assignment.focus_area_id === null,
      );
      if (empWorkAssignments.length === 0) continue;

      const shiftStart = new Date(2026, 3, 19); // April 19, 2026
      for (let i = 0; i < 14; i++) {
        const d = new Date(shiftStart);
        d.setDate(d.getDate() + i);
        const dt = dateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
        const dow = d.getDay();
        const rand = copycat.float(`${emp.id}-${dt}-shift`, { min: 0, max: 1 });
        if (rand > 0.92) continue; // ~8% chance of no shift

        if (rand > 0.75 || (dow === 0 && rand > 0.4)) {
          // Off day (~25% chance, higher on Sundays)
          if (offAbsenceType) {
            absenceValues.push({
              empId: emp.id,
              date: dt,
              absenceTypeId: offAbsenceType.id,
            });
          }
        } else {
          const assignment =
            empWorkAssignments[i % empWorkAssignments.length];
          const faId = assignment.focus_area_id ?? primaryFaId;
          workShiftValues.push({
            empId: emp.id,
            date: dt,
            shiftIds: [assignment.shift_id],
            jobIds: [assignment.job_id],
            focusAreaId: faId,
          });
        }
        shiftCount++;
      }
    }

    await writePublishedWorkScheduleCellsBatch(db, orgId, workShiftValues);
    await writePublishedAbsenceScheduleCellsBatch(db, orgId, absenceValues);

    console.log(`    ✓ ${deptIds.length} depts, ${tenant.focusAreas.length} focus areas, ${tenant.certifications.length} certs, ${tenant.assignments.length} schedule labels, ${seededJobs.totalJobCount} jobs, ${employees.length} employees, ${shiftCount} shifts`);
  }

  // ── Calm Haven (6th tenant) — from SQL seed file ────────────────────
  console.log(`\n  [6/7] Calm Haven...`);

  const calmHavenJobs = await seedTenantSqlBeforeSchedule(
    db,
    'supabase/seed_calm_haven.sql',
    "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
  );

  console.log(`    ✓ 4 focus areas, 6 certs, 8 roles, 17 schedule labels, ${calmHavenJobs.totalJobCount} jobs, 28 employees, shifts seeded`);

  // ── Arden Wood (7th tenant) — Calm Haven config + PDF-derived roster ──────
  console.log(`\n  [7/7] Arden Wood...`);

  const ardenWoodJobs = await seedTenantSqlBeforeSchedule(
    db,
    'supabase/seed_arden_wood.sql',
    "964c29d1-dc1e-4cd6-861c-8b8ab00d20c0",
  );

  const gridmasterSql = readFileSync('supabase/seed_gridmaster.sql', 'utf8');
  await db.query(gridmasterSql);

  console.log(`    ✓ Calm Haven configuration mirrored with 26 Arden Wood employees, ${ardenWoodJobs.totalJobCount} jobs, and seeded shifts`);

  // ── Auth Users & Profiles ──────────────────────────────────────────────
  // Create 3 test users, all assigned to a seeded organization.
  // Uses a DO $$ block (same pattern as seed_calm_haven.sql) to avoid
  // pg driver prepared-statement type inference issues.

  console.log("\n  Creating test users...");

  // Get organization IDs for user assignment
  const { rows: orgs } = await db.query(
    `SELECT id, slug FROM public.organizations WHERE slug IN ('sunrise-senior', 'calmhaven', 'ardenwood')`
  );
  const defaultOrgId = orgs.find((o: Record<string, unknown>) => o.slug === 'sunrise-senior')?.id;
  const calmhavenOrgId = orgs.find((o: Record<string, unknown>) => o.slug === 'calmhaven')?.id;
  const ardenwoodOrgId = orgs.find((o: Record<string, unknown>) => o.slug === 'ardenwood')?.id;

  const TEST_USERS = [
    { email: "nicokosmas.dev@gmail.com",     platform_role: "gridmaster", org_role: "user",        label: "gridmaster",  first_name: "Nicodamus", last_name: "Kosmas", preferred_org: "sunrise-senior" },
    { email: "nicokosmas@outlook.com",        platform_role: "none",       org_role: "super_admin", label: "super_admin", first_name: "Nic",       last_name: "Kosmas", preferred_org: "ardenwood" },
    { email: "nicodamusalois@gmail.com",       platform_role: "none",       org_role: "user",        label: "user",        first_name: "Nick",      last_name: "Kosmas", preferred_org: "calmhaven" },
  ];

  // All admin permissions (full edit access — for admin-role users)
  const allAdminPermsObj = {
    canViewSchedule: true, canEditShifts: true, canPublishSchedule: true, canApplyRecurringSchedule: true,
    canEditNotes: true, canEditScheduleIndicators: true, canViewRecurringShifts: true, canManageRecurringShifts: true, canManageShiftSeries: true,
    canViewStaff: true, canViewEmployeeDetails: true, canManageEmployees: true,
    canViewFocusAreas: true, canManageFocusAreas: true, canViewScheduleDefinitions: true, canManageScheduleDefinitions: true,
    canViewIndicatorTypes: true, canManageIndicatorTypes: true, canManageOrgSettings: true,
    canViewOrgLabels: true, canManageOrgLabels: true, canViewCoverageRequirements: true, canManageCoverageRequirements: true,
    canApproveShiftRequests: true, canViewDashboardAnalytics: true,
  };

  // View-only permissions for user-role members (no edit access, can see everything)
  const userViewPermsObj = {
    canViewSchedule: true, canEditShifts: false, canPublishSchedule: false, canApplyRecurringSchedule: false,
    canEditNotes: false, canEditScheduleIndicators: false, canViewRecurringShifts: true, canManageRecurringShifts: false, canManageShiftSeries: false,
    canViewStaff: true, canViewEmployeeDetails: true, canManageEmployees: false,
    canViewFocusAreas: true, canManageFocusAreas: false, canViewScheduleDefinitions: true, canManageScheduleDefinitions: false,
    canViewIndicatorTypes: true, canManageIndicatorTypes: false, canManageOrgSettings: false,
    canViewOrgLabels: true, canManageOrgLabels: false, canViewCoverageRequirements: true, canManageCoverageRequirements: false,
    canApproveShiftRequests: false, canViewDashboardAnalytics: true,
  };

  for (const user of TEST_USERS) {
    const orgIdStr = user.preferred_org === 'ardenwood'
      ? ardenwoodOrgId
      : user.preferred_org === 'calmhaven'
        ? calmhavenOrgId
        : defaultOrgId;
    const orgIdSql = user.platform_role === "gridmaster" ? "NULL" : `'${orgIdStr}'`;

    await db.query(`
      DO $$
      DECLARE
        uid uuid;
      BEGIN
        SELECT id INTO uid FROM auth.users WHERE email = '${user.email}';

        IF uid IS NULL THEN
          uid := gen_random_uuid();
          INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user,
            confirmation_token, recovery_token, email_change_token_new,
            email_change_token_current, email_change, phone, phone_change,
            phone_change_token, reauthentication_token
          )
          VALUES (
            '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
            '${user.email}', crypt('password123', gen_salt('bf')), now(),
            now(), now(), '{"provider":"email","providers":["email"]}', '{}', false,
            '', '', '', '', '', NULL, '', '', ''
          );

          INSERT INTO auth.identities (
            id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
          )
          VALUES (
            gen_random_uuid(), uid, uid::text,
            format('{"sub":"%s","email":"%s"}', uid::text, '${user.email}')::jsonb,
            'email', now(), now(), now()
          );
        ELSE
          UPDATE auth.users
          SET encrypted_password = crypt('password123', gen_salt('bf')),
              email_confirmed_at = COALESCE(email_confirmed_at, now())
          WHERE id = uid;
        END IF;

        INSERT INTO public.profiles (id, org_id, platform_role, first_name, last_name)
        VALUES (uid, ${orgIdSql}, '${user.platform_role}', '${user.first_name}', '${user.last_name}')
        ON CONFLICT (id) DO UPDATE
          SET org_id        = EXCLUDED.org_id,
              platform_role = EXCLUDED.platform_role,
              first_name    = EXCLUDED.first_name,
              last_name     = EXCLUDED.last_name,
              updated_at    = NOW();
      END $$;
    `);

    console.log(`    ✓ ${user.label}: ${user.email}`);
  }

  // ── Organization Memberships ─────────────────────────────────────────
  // Create memberships for each non-gridmaster user across all seeded organizations.
  // Gridmaster bypasses RLS globally and doesn't need memberships.

  console.log("\n  Creating organization memberships...");

  const { rows: allOrgs } = await db.query(
    `SELECT id FROM public.organizations ORDER BY name`
  );

  const memberUsers = TEST_USERS.filter((u) => u.platform_role !== "gridmaster");

  const membershipSeeds: Array<{
    email: string;
    org_id: string;
    org_role: string;
    admin_permissions: Record<string, boolean> | null;
  }> = [];
  for (const user of memberUsers) {
    const adminPermissions =
      user.org_role === "admin" ? allAdminPermsObj
      : user.org_role === "user" ? userViewPermsObj
      : null;
    for (const org of allOrgs) {
      membershipSeeds.push({
        email: user.email,
        org_id: org.id,
        org_role: user.org_role,
        admin_permissions: adminPermissions,
      });
    }
  }

  if (membershipSeeds.length > 0) {
    await db.query(
      `INSERT INTO public.organization_memberships (user_id, org_id, org_role, admin_permissions)
       SELECT p.id, m.org_id, m.org_role::org_role, m.admin_permissions
       FROM jsonb_to_recordset($1::jsonb) AS m(
         email text, org_id uuid, org_role text, admin_permissions jsonb
       )
       JOIN auth.users a ON a.email = m.email
       JOIN public.profiles p ON p.id = a.id
       ON CONFLICT (user_id, org_id) DO UPDATE
         SET org_role          = EXCLUDED.org_role,
             admin_permissions = EXCLUDED.admin_permissions`,
      [JSON.stringify(membershipSeeds)],
    );
  }

  for (const user of memberUsers) {
    console.log(`    ✓ ${user.label}: ${allOrgs.length} organizations`);
  }

  console.log("\n✅ All 7 tenants + 3 test users + memberships seeded successfully!");
  await db.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
