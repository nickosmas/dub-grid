"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import ChangeReviewModal, { type ReviewChange } from "@/components/review/ChangeReviewModal";
import { ADMIN_DEFAULT_PERMS, VIEW_IMPLICATIONS } from "@/features/permissions";
import type { AdminPermissions } from "@/types";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { Switch } from "@/components/ui/switch";

type PermissionKey = keyof AdminPermissions;

type Category = "CORE" | "ADMINISTRATION";

/** Org-customizable terms the row descriptions mention. */
export interface PermissionEditorLabels {
  focusAreaLabel: string;
  certificationLabel: string;
  roleLabel: string;
}

export interface PermissionModule {
  id: string;
  title: string;
  description: string | ((labels: PermissionEditorLabels) => string);
  icon: keyof typeof MODULE_ICONS;
  category: Category;
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

export interface PermissionReviewConfig {
  title: string;
  description: string;
  changes: ReviewChange[];
  confirmLabel?: string;
  warningText?: string;
}

const CATEGORY_LABELS: Record<Category, string> = {
  CORE: "Core Operations",
  ADMINISTRATION: "Administration",
};

const CATEGORY_ORDER: Category[] = ["CORE", "ADMINISTRATION"];

const DEFAULT_LABELS: PermissionEditorLabels = {
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
    description: "Edit shifts, notes, and indicators on the organization-wide schedule.",
    icon: "calendar",
    category: "CORE",
    viewKeys: [],
    editKeys: ["canEditShifts", "canEditNotes", "canEditScheduleIndicators"],
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
      `View employee profiles, contact details, and ${inSentence(labels.certificationLabel)}. Edit adds inviting people and granting management access.`,
    icon: "users",
    category: "CORE",
    viewKeys: ["canViewEmployeeDetails"],
    editKeys: ["canManageEmployees"],
  },
  {
    id: "shift-requests",
    title: "Shift requests",
    description: "Approve or deny pickup, swap, and call-off requests.",
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
    title: "Shifts, jobs & indicators",
    description: "Manage shift codes, jobs, absence types, and indicator types.",
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

const CONFIGURABLE_KEYS: PermissionKey[] = PERMISSION_MODULES.flatMap((m) => [
  ...m.viewKeys,
  ...m.editKeys,
]).filter((k) => !ALWAYS_ON_KEYS.has(k) && !SUPER_ADMIN_ONLY_KEYS.has(k));

function buildInitialPermissions(
  initialPermissions: AdminPermissions | null | undefined,
): AdminPermissions {
  // Same base the resolver uses, so a key the stored set never mentions shows
  // the access the admin actually has; starting from all-off would have a save
  // of any other switch silently revoke it.
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

function describeModule(mod: PermissionModule, labels: PermissionEditorLabels): string {
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

type CellState =
  { kind: "switch"; on: boolean } | { kind: "text"; label: string } | { kind: "empty" };

function viewCellState(mod: PermissionModule, perms: AdminPermissions): CellState {
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

function editCellState(mod: PermissionModule, perms: AdminPermissions): CellState {
  if (mod.editKeys.length > 0) return { kind: "switch", on: isOn(perms, mod.editKeys) };
  if (mod.viewKeys.length > 0) return { kind: "text", label: "Read only" };
  return { kind: "empty" };
}

function impliedNote(mod: PermissionModule, perms: AdminPermissions): string | null {
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

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const MODULE_ICONS = {
  calendar: () => (
    <svg {...iconProps}>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  send: () => (
    <svg {...iconProps}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  repeat: () => (
    <svg {...iconProps}>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  users: () => (
    <svg {...iconProps}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  checkCircle: () => (
    <svg {...iconProps}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  barChart: () => (
    <svg {...iconProps}>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  ),
  tag: () => (
    <svg {...iconProps}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  settings: () => (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  pieChart: () => (
    <svg {...iconProps}>
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  ),
  fileText: () => (
    <svg {...iconProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
};

function ToggleSwitch({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: () => void;
}) {
  return <Switch checked={on} ariaLabel={label} onChange={() => onChange()} />;
}

function AccessCell({
  state,
  label,
  onToggle,
}: {
  state: CellState;
  label: string;
  onToggle: () => void;
}) {
  if (state.kind === "switch") {
    return <ToggleSwitch on={state.on} label={label} onChange={onToggle} />;
  }
  if (state.kind === "text") {
    return <span className="text-[12px] text-[var(--dg-color-text-faint)]">{state.label}</span>;
  }
  return null;
}

function ModuleRow({
  mod,
  perms,
  labels,
  onToggleView,
  onToggleEdit,
}: {
  mod: PermissionModule;
  perms: AdminPermissions;
  labels: PermissionEditorLabels;
  onToggleView: () => void;
  onToggleEdit: () => void;
}) {
  const Icon = MODULE_ICONS[mod.icon];
  const view = viewCellState(mod, perms);
  const edit = editCellState(mod, perms);
  const isActive =
    (view.kind === "switch" && view.on) ||
    (view.kind === "text" && view.label !== "Off") ||
    (edit.kind === "switch" && edit.on);
  const note = impliedNote(mod, perms) ?? mod.note;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 hover:bg-[var(--dg-color-bg)] transition-colors items-center">
      <div className="col-span-1 md:col-span-8 flex items-start">
        <div
          className={`p-2 rounded-lg mr-4 shrink-0 ${isActive ? "bg-[var(--dg-color-brand-bg)] text-[var(--dg-color-brand)]" : "bg-[var(--dg-color-bg-secondary)] text-[var(--dg-color-text-faint)]"}`}
        >
          <Icon />
        </div>
        <div>
          <h4 className="font-medium text-[14px] text-[var(--dg-color-text-primary)]">
            {mod.title}
          </h4>
          <p className="text-[13px] text-[var(--dg-color-text-muted)] mt-0.5 pr-4 leading-relaxed">
            {describeModule(mod, labels)}
          </p>
          {note && (
            <p className="text-[12px] text-[var(--dg-color-text-faint)] mt-1 pr-4 leading-relaxed">
              {note}
            </p>
          )}
        </div>
      </div>

      <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-4 mt-3 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-[var(--dg-color-border-light)]">
        <div className="flex flex-col items-center justify-center gap-1.5 text-center">
          <span className="dg-type-table-heading md:hidden">View</span>
          <AccessCell state={view} label={`${mod.title} view`} onToggle={onToggleView} />
        </div>
        <div className="flex flex-col items-center justify-center gap-1.5 text-center">
          <span className="dg-type-table-heading md:hidden">Edit</span>
          <AccessCell state={edit} label={`${mod.title} edit`} onToggle={onToggleEdit} />
        </div>
      </div>
    </div>
  );
}

interface PermissionsEditorProps {
  title: string;
  subtitle: React.ReactNode;
  initialPermissions: AdminPermissions | null | undefined;
  showPermissionCounter?: boolean;
  labels?: Partial<PermissionEditorLabels>;
  onSave: (perms: AdminPermissions) => Promise<void>;
  onClose: () => void;
  /**
   * `initial` is the resolved starting set (stored row over the admin
   * baseline), so a review compares real access rather than a raw row that
   * may be null.
   */
  buildReview?: (
    perms: AdminPermissions,
    initial: AdminPermissions,
  ) => PermissionReviewConfig | null;
}

export default function PermissionsEditor({
  title,
  subtitle,
  initialPermissions,
  showPermissionCounter,
  labels,
  onSave,
  onClose,
  buildReview,
}: PermissionsEditorProps) {
  const initialPerms = useMemo(
    () => buildInitialPermissions(initialPermissions),
    [initialPermissions],
  );
  const [perms, setPerms] = useState<AdminPermissions>(initialPerms);
  const [saving, setSaving] = useState(false);
  const [reviewConfig, setReviewConfig] = useState<PermissionReviewConfig | null>(null);
  const resolvedLabels: PermissionEditorLabels = {
    focusAreaLabel: labels?.focusAreaLabel || DEFAULT_LABELS.focusAreaLabel,
    certificationLabel: labels?.certificationLabel || DEFAULT_LABELS.certificationLabel,
    roleLabel: labels?.roleLabel || DEFAULT_LABELS.roleLabel,
  };

  useEffect(() => {
    setPerms(initialPerms);
  }, [initialPerms]);

  // Edit implies view within a row, so turning Edit on brings View with it;
  // while Edit is on the View cell reads "Included" and cannot be switched off.
  // Cross-row implications (Dashboard) are left to the resolver rather than
  // written into the stored set.
  function toggleModule(mod: PermissionModule, direction: "view" | "edit") {
    setPerms((prev) => {
      const keys = direction === "view" ? mod.viewKeys : mod.editKeys;
      const next = { ...prev };
      const newVal = !isOn(prev, keys);
      for (const key of keys) next[key] = newVal;
      if (direction === "edit" && newVal) {
        for (const key of mod.viewKeys) next[key] = true;
      }
      return next;
    });
  }

  const hasChanges = CONFIGURABLE_KEYS.some((key) => perms[key] !== initialPerms[key]);
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges: hasChanges,
    onDiscard: onClose,
  });
  const handleRequestClose = () => {
    if (!saving && requestClose()) {
      onClose();
    }
  };

  function setAll(value: boolean) {
    setPerms((prev) => {
      const next = { ...prev };
      for (const key of CONFIGURABLE_KEYS) next[key] = value;
      return next;
    });
  }

  async function performSave() {
    setSaving(true);
    try {
      await onSave(perms);
      setReviewConfig(null);
      onClose();
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't update those permissions."));
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    if (!hasChanges) return;
    if (!buildReview) {
      void performSave();
      return;
    }

    const nextReview = buildReview(perms, initialPerms);
    if (!nextReview || nextReview.changes.length === 0) {
      void performSave();
      return;
    }

    setReviewConfig(nextReview);
  }

  // Counts what the screen shows (one access level per switch) rather than
  // the stored keys behind it, which is what the old counter did.
  const levelCount = PERMISSION_MODULES.reduce(
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

  const groupedModules = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    modules: PERMISSION_MODULES.filter((m) => m.category === cat),
  }));

  return (
    <>
      <Modal
        title={title}
        onClose={onClose}
        onRequestClose={() => !saving && requestClose()}
        style={{ maxWidth: 680 }}
        footer={
          <EditorActionRow
            className="px-6"
            secondaryAction={
              <Button
                className="dg-btn dg-btn-secondary"
                onClick={handleRequestClose}
                disabled={saving}
              >
                {EDITOR_ACTION_LABELS.close}
              </Button>
            }
            primaryAction={
              <Button
                className="dg-btn dg-btn-primary"
                onClick={handleSave}
                disabled={saving || !hasChanges}
              >
                <ButtonLoading loading={saving} spinnerSize={16}>
                  {EDITOR_ACTION_LABELS.save}
                </ButtonLoading>
              </Button>
            }
          />
        }
      >
        <div className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-4 border-b border-[var(--dg-color-border-light)] bg-[var(--dg-color-bg)] shrink-0">
            <p className="text-[14px] text-[var(--dg-color-text-muted)] leading-relaxed">
              {subtitle}
            </p>
            {showPermissionCounter && (
              <p className="text-[12px] text-[var(--dg-color-text-faint)] mt-1">
                {levelCount.enabled} of {levelCount.total} access levels enabled
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <Button
                className="dg-btn dg-btn-ghost"
                onClick={() => setAll(true)}
                style={{ fontSize: 12 }}
              >
                Select All
              </Button>
              <Button
                className="dg-btn dg-btn-ghost"
                onClick={() => setAll(false)}
                style={{ fontSize: 12 }}
              >
                Clear All
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="dg-type-table-heading hidden grid-cols-12 gap-4 border-b border-[var(--dg-color-border-light)] px-6 py-3 md:grid">
              <div className="col-span-8">Module & access level</div>
              <div className="col-span-2 text-center">View</div>
              <div className="col-span-2 text-center">Edit</div>
            </div>

            {groupedModules.map((group) => (
              <div key={group.category} className="pb-1">
                <div className="px-6 py-3 bg-[var(--dg-color-bg)]">
                  <h3 className="dg-type-content-group-heading">{group.label}</h3>
                </div>

                <div className="divide-y divide-[var(--dg-color-border-light)]">
                  {group.modules.map((mod) => (
                    <ModuleRow
                      key={mod.id}
                      mod={mod}
                      perms={perms}
                      labels={resolvedLabels}
                      onToggleView={() => toggleModule(mod, "view")}
                      onToggleEdit={() => toggleModule(mod, "edit")}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
      {unsavedChangesDialog}
      {reviewConfig ? (
        <ChangeReviewModal
          title={reviewConfig.title}
          description={reviewConfig.description}
          changes={reviewConfig.changes}
          saving={saving}
          confirmLabel={reviewConfig.confirmLabel}
          warningText={reviewConfig.warningText}
          onCancel={() => {
            if (!saving) setReviewConfig(null);
          }}
          onConfirm={() => performSave()}
        />
      ) : null}
    </>
  );
}
