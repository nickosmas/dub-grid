import type { AdminPermissions } from "@dubgrid/domain";
import { ADMIN_DEFAULT_PERMS, VIEW_IMPLICATIONS } from "./index";

/**
 * The areas an Admin's permissions are set by, with a View and an Edit level
 * each, shared by web's permissions editor and the app's Permissions screen so
 * the two can't drift.
 */

export type PermissionKey = keyof AdminPermissions;

export type PermissionCategory = "CORE" | "ADMINISTRATION";

/** Org-customizable terms the row descriptions mention. */
export interface PermissionEditorLabels {
  focusAreaLabel: string;
  certificationLabel: string;
  roleLabel: string;
}

export type PermissionModuleIcon =
  | "calendar"
  | "send"
  | "repeat"
  | "users"
  | "checkCircle"
  | "barChart"
  | "tag"
  | "settings"
  | "pieChart"
  | "fileText";

export interface PermissionModule {
  id: string;
  title: string;
  description: string | ((labels: PermissionEditorLabels) => string);
  icon: PermissionModuleIcon;
  category: PermissionCategory;
  viewKeys: PermissionKey[];
  editKeys: PermissionKey[];
  alwaysOnView?: boolean;
  /**
   * Keys owned by other rows that grant this row's view level on the server.
   * The row has no view key of its own, so the cell reports whether any of
   * these is on instead of showing a switch.
   */
  viewIncludedWith?: PermissionKey[];
  /** A dependency the switches cannot express, shown under the description. */
  note?: string;
}

export const PERMISSION_CATEGORY_ORDER: PermissionCategory[] = ["CORE", "ADMINISTRATION"];

export const PERMISSION_CATEGORY_LABELS: Record<PermissionCategory, string> = {
  CORE: "Scheduling and staff",
  ADMINISTRATION: "Administration",
};

export const DEFAULT_PERMISSION_LABELS: PermissionEditorLabels = {
  focusAreaLabel: "Focus Areas",
  certificationLabel: "Certifications",
  roleLabel: "Roles",
};

function inSentence(label: string): string {
  return label.toLowerCase();
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    id: "schedule",
    title: "Schedule",
    description: "Edit shifts and schedule notes on the organization-wide schedule.",
    icon: "calendar",
    category: "CORE",
    viewKeys: [],
    editKeys: ["canEditShifts", "canEditNotes"],
    alwaysOnView: true,
  },
  {
    id: "publish",
    title: "Publish schedule",
    description: "Make draft schedule changes live for staff.",
    icon: "send",
    category: "CORE",
    viewKeys: [],
    editKeys: ["canPublishSchedule"],
  },
  {
    id: "recurring-shifts",
    title: "Recurring shifts",
    description: "Manage recurring shift templates and series, and apply them to date ranges.",
    icon: "repeat",
    category: "CORE",
    viewKeys: ["canViewRecurringShifts"],
    editKeys: ["canManageRecurringShifts", "canApplyRecurringSchedule", "canManageShiftSeries"],
    note: "Applying to the grid and creating series also need Schedule: Edit.",
  },
  {
    id: "staff",
    title: "Staff",
    description: (labels) =>
      `See staff profiles, contact details, and ${inSentence(labels.certificationLabel)}. With Edit, they can also add and invite people, change their status, and set their access role.`,
    icon: "users",
    category: "CORE",
    viewKeys: ["canViewEmployeeDetails"],
    editKeys: ["canManageEmployees"],
  },
  {
    id: "shift-requests",
    title: "Shift requests",
    description: "Approve or reject pickup, swap, and call-off requests.",
    icon: "checkCircle",
    category: "CORE",
    viewKeys: [],
    editKeys: ["canApproveShiftRequests"],
    viewIncludedWith: ["canApproveShiftRequests", "canManageEmployees", "canEditShifts"],
    note: "Seeing everyone's requests comes with Approve, Staff: Edit, or Schedule: Edit.",
  },
  {
    id: "coverage",
    title: "Coverage",
    description: "Set staffing minimums and coverage targets.",
    icon: "barChart",
    category: "ADMINISTRATION",
    viewKeys: ["canViewCoverageRequirements"],
    editKeys: ["canManageCoverageRequirements"],
  },
  {
    id: "departments-labels",
    title: "Departments & labels",
    description: (labels) =>
      `Manage departments and ${inSentence(labels.focusAreaLabel)}, plus the ${inSentence(labels.roleLabel)}, ${inSentence(labels.certificationLabel)}, and terminology labels.`,
    icon: "tag",
    category: "ADMINISTRATION",
    viewKeys: ["canViewFocusAreas", "canViewOrgLabels"],
    editKeys: ["canManageFocusAreas", "canManageOrgLabels"],
  },
  {
    id: "scheduling-config",
    title: "Shifts, jobs & schedule notes",
    description: "Manage shift codes, jobs, absence types, and schedule note types.",
    icon: "settings",
    category: "ADMINISTRATION",
    viewKeys: ["canViewScheduleDefinitions", "canViewIndicatorTypes"],
    editKeys: ["canManageScheduleDefinitions", "canManageIndicatorTypes"],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    description: "View analytics and statistics.",
    icon: "pieChart",
    category: "ADMINISTRATION",
    viewKeys: ["canViewDashboardAnalytics"],
    editKeys: [],
  },
  {
    id: "reports",
    title: "Reports",
    description: "View staff hours, staff activity, and shift category reports, and export them.",
    icon: "fileText",
    category: "ADMINISTRATION",
    viewKeys: ["canViewReports"],
    editKeys: [],
  },
];

const ALWAYS_ON_KEYS = new Set<PermissionKey>(["canViewSchedule", "canViewStaff"]);

/** Never delegatable: authz forces these off for admins whatever is stored. */
const SUPER_ADMIN_ONLY_KEYS = new Set<PermissionKey>(["canManageOrgSettings"]);

export const CONFIGURABLE_PERMISSION_KEYS: PermissionKey[] = PERMISSION_MODULES.flatMap((m) => [
  ...m.viewKeys,
  ...m.editKeys,
]).filter((k) => !ALWAYS_ON_KEYS.has(k) && !SUPER_ADMIN_ONLY_KEYS.has(k));

/**
 * The set an editor starts from. Same base the resolver uses, so a key the
 * stored set never mentions shows the access the admin actually has; starting
 * from all-off would have a save of any other switch silently revoke it.
 */
export function buildInitialPermissions(
  initialPermissions: Partial<AdminPermissions> | null | undefined,
): AdminPermissions {
  const initial: AdminPermissions = {
    ...ADMIN_DEFAULT_PERMS,
    ...(initialPermissions ?? {}),
    canViewSchedule: true,
    canViewStaff: true,
  };
  for (const key of SUPER_ADMIN_ONLY_KEYS) {
    initial[key] = false;
  }
  return initial;
}

export function describePermissionModule(
  mod: PermissionModule,
  labels: PermissionEditorLabels,
): string {
  return typeof mod.description === "function" ? mod.description(labels) : mod.description;
}

function isOn(perms: AdminPermissions, keys: PermissionKey[]): boolean {
  return keys.length > 0 && keys.every((k) => perms[k] === true);
}

/** Rows whose edit level is on and grants the given view key on the server. */
function modulesImplying(viewKey: PermissionKey, perms: AdminPermissions): PermissionModule[] {
  const sources = VIEW_IMPLICATIONS[viewKey] ?? [];
  return PERMISSION_MODULES.filter((m) =>
    m.editKeys.some((k) => sources.includes(k) && perms[k] === true),
  );
}

export type PermissionCellState =
  { kind: "switch"; on: boolean } | { kind: "text"; label: string } | { kind: "empty" };

export function viewCellState(mod: PermissionModule, perms: AdminPermissions): PermissionCellState {
  if (mod.alwaysOnView) return { kind: "text", label: "Always on" };
  if (mod.viewKeys.length > 0) {
    const implied = mod.viewKeys.every((vk) => modulesImplying(vk, perms).length > 0);
    if (implied) return { kind: "text", label: "Included" };
    return { kind: "switch", on: isOn(perms, mod.viewKeys) };
  }
  if (mod.viewIncludedWith) {
    const on = mod.viewIncludedWith.some((k) => perms[k] === true);
    return { kind: "text", label: on ? "Included" : "Off" };
  }
  return { kind: "empty" };
}

export function editCellState(mod: PermissionModule, perms: AdminPermissions): PermissionCellState {
  if (mod.editKeys.length > 0) return { kind: "switch", on: isOn(perms, mod.editKeys) };
  if (mod.viewKeys.length > 0) return { kind: "text", label: "Read only" };
  return { kind: "empty" };
}

/** Why a row's View reads "Included", or null when it doesn't. */
export function impliedViewNote(mod: PermissionModule, perms: AdminPermissions): string | null {
  if (mod.viewKeys.length === 0) return null;
  const sources = new Map<string, PermissionModule>();
  for (const vk of mod.viewKeys) {
    for (const source of modulesImplying(vk, perms)) sources.set(source.id, source);
  }
  if (sources.size === 0) return null;
  if (sources.size === 1 && sources.has(mod.id)) return "Included with Edit.";
  const titles = [...sources.values()].filter((m) => m.id !== mod.id).map((m) => m.title);
  return `Included with ${titles.join(", ")}.`;
}

/**
 * Flips one level of a row. Edit implies View within a row, so turning Edit on
 * brings View with it; cross-row implications are left to the resolver rather
 * than written into the stored set.
 */
export function togglePermissionModule(
  perms: AdminPermissions,
  mod: PermissionModule,
  direction: "view" | "edit",
): AdminPermissions {
  const keys = direction === "view" ? mod.viewKeys : mod.editKeys;
  const next = { ...perms };
  const newVal = !isOn(perms, keys);
  for (const key of keys) next[key] = newVal;
  if (direction === "edit" && newVal) {
    for (const key of mod.viewKeys) next[key] = true;
  }
  return next;
}

/** Counts what the screen shows, one level per switch, rather than the stored keys behind it. */
export function countPermissionLevels(perms: AdminPermissions): { enabled: number; total: number } {
  return PERMISSION_MODULES.reduce(
    (acc, mod) => {
      for (const state of [viewCellState(mod, perms), editCellState(mod, perms)]) {
        if (state.kind === "switch") {
          acc.total += 1;
          if (state.on) acc.enabled += 1;
        } else if (state.kind === "text" && (state.label === "Included" || state.label === "Off")) {
          acc.total += 1;
          if (state.label === "Included") acc.enabled += 1;
        }
      }
      return acc;
    },
    { enabled: 0, total: 0 },
  );
}
